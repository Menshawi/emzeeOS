'use strict';
// Serves an ordinary MP4 (the fireplace video) as fragmented MP4, so the page can loop it seamlessly through
// Media Source Extensions: one video element and one decoder, fed the same clip again and again as one
// continuous stream. (A plain <video loop> seeks back and stalls at the loop point, and the TV can't decode two
// 4K copies at once to crossfade them.)
//   init()       the initialisation segment: the original moov with empty sample tables, plus mvex
//   loop(res)    the whole clip as one media segment per track (moof + mdat), with the sample data streamed
//                straight from the original file, so nothing is converted or stored twice
// Edit lists are applied by shifting composition times, since MSE ignores them: the first frame shows at 0.
const fs = require('fs');

function u32(b, o) { return b.readUInt32BE(o); }
function u64(b, o) { return u32(b, o) * 4294967296 + u32(b, o + 4); }

// the child boxes of a container: [{type, start, hdr, size}]
function boxes(b, start, end) {
  const out = [];
  let o = start;
  while (o + 8 <= end) {
    let size = u32(b, o), hdr = 8;
    const type = b.toString('latin1', o + 4, o + 8);
    if (size === 1) { size = u64(b, o + 8); hdr = 16; } else if (size === 0) size = end - o;
    if (size < hdr || o + size > end) break;
    out.push({ type: type, start: o, hdr: hdr, size: size });
    o += size;
  }
  return out;
}
function child(b, box, type) {
  return boxes(b, box.start + box.hdr, box.start + box.size).filter(function (c) { return c.type === type; })[0];
}
function body(b, box) { return b.slice(box.start + box.hdr, box.start + box.size); }
function raw(b, box) { return b.slice(box.start, box.start + box.size); }

// a box from its type and contents
function box(type, parts) {
  const data = Buffer.concat(parts);
  const h = Buffer.alloc(8);
  h.writeUInt32BE(8 + data.length, 0);
  h.write(type, 4, 'latin1');
  return Buffer.concat([h, data]);
}
function full(type, version, flags, parts) {
  const vf = Buffer.alloc(4);
  vf.writeUInt32BE(((version & 0xff) << 24) | (flags & 0xffffff), 0);
  return box(type, [vf].concat(parts));
}
function words(list) {
  const b = Buffer.alloc(list.length * 4);
  list.forEach(function (v, i) { if (v < 0) b.writeInt32BE(v, i * 4); else b.writeUInt32BE(v, i * 4); });
  return b;
}

// one track's samples, from its stbl: [{offset, size, duration, cts, sync}]
function samples(b, stbl) {
  const t = {};
  boxes(b, stbl.start + stbl.hdr, stbl.start + stbl.size).forEach(function (c) { t[c.type] = body(b, c); });
  const stsz = t.stsz, fixed = u32(stsz, 4), count = u32(stsz, 8);
  const sizes = [];
  for (let i = 0; i < count; i++) sizes.push(fixed || u32(stsz, 12 + i * 4));
  const chunks = [];
  if (t.co64) for (let i = 0, n = u32(t.co64, 4); i < n; i++) chunks.push(u64(t.co64, 8 + i * 8));
  else for (let i = 0, n = u32(t.stco, 4); i < n; i++) chunks.push(u32(t.stco, 8 + i * 4));
  const stsc = [];
  for (let i = 0, n = u32(t.stsc, 4); i < n; i++) stsc.push([u32(t.stsc, 8 + i * 12), u32(t.stsc, 12 + i * 12)]);
  const out = [];
  let s = 0;
  for (let c = 0, e = 0; c < chunks.length && s < count; c++) {
    while (e + 1 < stsc.length && stsc[e + 1][0] <= c + 1) e++;
    let off = chunks[c];
    for (let k = 0; k < stsc[e][1] && s < count; k++, s++) { out.push({ offset: off, size: sizes[s], duration: 0, cts: 0, sync: !t.stss }); off += sizes[s]; }
  }
  for (let i = 0, n = u32(t.stts, 4), s2 = 0; i < n; i++) {
    for (let k = 0, m = u32(t.stts, 8 + i * 8), d = u32(t.stts, 12 + i * 8); k < m && s2 < out.length; k++) out[s2++].duration = d;
  }
  if (t.ctts) {
    const v1 = t.ctts[0] === 1;
    for (let i = 0, n = u32(t.ctts, 4), s2 = 0; i < n; i++) {
      const m = u32(t.ctts, 8 + i * 8), d = v1 ? t.ctts.readInt32BE(12 + i * 8) : u32(t.ctts, 12 + i * 8);
      for (let k = 0; k < m && s2 < out.length; k++) out[s2++].cts = d;
    }
  }
  if (t.stss) for (let i = 0, n = u32(t.stss, 4); i < n; i++) { const k = u32(t.stss, 8 + i * 4) - 1; if (out[k]) out[k].sync = true; }
  return { list: out, stsd: t.stsd };
}

// the codecs string MSE asks for, e.g. video/mp4; codecs="avc1.640033,mp4a.40.2"
function codecOf(stsd) {
  const entry = stsd.toString('latin1', 12, 16);
  if (entry === 'avc1' || entry === 'avc3') {
    const i = stsd.indexOf('avcC', 0, 'latin1');
    if (i > 0) return entry + '.' + stsd.slice(i + 5, i + 8).toString('hex');
  }
  if (entry === 'mp4a') {
    // the DecoderSpecificInfo's first 5 bits are the audio object type (2 = AAC LC)
    const i = stsd.indexOf(Buffer.from([0x05]), stsd.indexOf('esds', 0, 'latin1'));
    let aot = 2;
    if (i > 0) { let j = i + 1; while (stsd[j] & 0x80) j++; aot = stsd[j + 1] >> 3 || 2; }
    return 'mp4a.40.' + aot;
  }
  return entry;
}

let cached = null;   // { key, plan }
function plan(file) {
  const st = fs.statSync(file), key = st.size + ':' + st.mtimeMs;
  if (cached && cached.key === key) return cached.plan;
  // the moov sits at the start or the end; read just the boxes' headers and the moov
  const fd = fs.openSync(file, 'r');
  let moov = null;
  try {
    let o = 0;
    const h = Buffer.alloc(16);
    while (o < st.size) {
      fs.readSync(fd, h, 0, 16, o);
      let size = u32(h, 0);
      const type = h.toString('latin1', 4, 8);
      if (size === 1) size = u64(h, 8); else if (size === 0) size = st.size - o;
      if (type === 'moov') { moov = Buffer.alloc(size); fs.readSync(fd, moov, 0, size, o); break; }
      if (size < 8) break;
      o += size;
    }
  } finally { fs.closeSync(fd); }
  if (!moov) throw new Error('no moov box');

  const top = { start: 0, hdr: 8, size: moov.length };
  const tracks = [];
  boxes(moov, 8, moov.length).filter(function (c) { return c.type === 'trak'; }).forEach(function (trak) {
    const tkhd = child(moov, trak, 'tkhd'), mdia = child(moov, trak, 'mdia');
    const mdhd = child(moov, mdia, 'mdhd'), hdlr = child(moov, mdia, 'hdlr'), minf = child(moov, mdia, 'minf');
    const stbl = child(moov, minf, 'stbl');
    const tk = body(moov, tkhd), md = body(moov, mdhd);
    const id = tk[0] === 1 ? u32(tk, 20) : u32(tk, 12);
    const timescale = md[0] === 1 ? u32(md, 20) : u32(md, 12);
    const kind = body(moov, hdlr).toString('latin1', 8, 12);
    if (kind !== 'vide' && kind !== 'soun') return;
    // a single edit with a media start (B-frame delay or audio priming): applied as a shift in composition time
    let shift = 0;
    const edts = child(moov, trak, 'edts'), elst = edts && child(moov, edts, 'elst');
    if (elst) {
      const e = body(moov, elst);
      if (u32(e, 4) >= 1) shift = e[0] === 1 ? u64(e, 16) : e.readInt32BE(12);
      if (shift < 0) shift = 0;
    }
    const s = samples(moov, stbl);
    // the init segment's trak: everything but edts, and sample tables left empty
    const minfKids = boxes(moov, minf.start + minf.hdr, minf.start + minf.size).filter(function (c) { return c.type !== 'stbl'; }).map(function (c) { return raw(moov, c); });
    const emptyStbl = box('stbl', [
      raw(moov, child(moov, stbl, 'stsd')),
      full('stts', 0, 0, [words([0])]), full('stsc', 0, 0, [words([0])]),
      full('stsz', 0, 0, [words([0, 0])]), full('stco', 0, 0, [words([0])])
    ]);
    tracks.push({
      id: id, kind: kind, timescale: timescale, shift: shift, samples: s.list, codec: codecOf(s.stsd),
      trak: box('trak', [raw(moov, tkhd), box('mdia', [raw(moov, mdhd), raw(moov, hdlr), box('minf', minfKids.concat([emptyStbl]))])])
    });
  });
  if (!tracks.length) throw new Error('no audio or video tracks');

  const mvhd = raw(moov, child(moov, top, 'mvhd'));
  const mvex = box('mvex', tracks.map(function (t) { return full('trex', 0, 0, [words([t.id, 1, 0, 0, 0])]); }));
  const ftyp = box('ftyp', [Buffer.from('isom', 'latin1'), words([0x200]), Buffer.from('isomiso6mp41', 'latin1')]);
  const init = Buffer.concat([ftyp, box('moov', [mvhd].concat(tracks.map(function (t) { return t.trak; })).concat([mvex]))]);

  // one moof + mdat per track, covering the whole clip
  let seq = 0;
  const parts = tracks.map(function (t) {
    const video = t.kind === 'vide';
    const flags = 0x000001 | 0x000100 | 0x000200 | 0x000400 | (video ? 0x000800 : 0);
    const per = [];
    t.samples.forEach(function (x) {
      per.push(x.duration, x.size, x.sync ? 0x02000000 : 0x01010000);
      if (video) per.push(x.cts - t.shift);
    });
    const build = function (dataOffset) {
      return box('moof', [
        full('mfhd', 0, 0, [words([++seq])]),
        box('traf', [
          full('tfhd', 0, 0x020000, [words([t.id])]),
          full('tfdt', 1, 0, [words([0, 0])]),
          full('trun', video ? 1 : 0, flags, [words([t.samples.length, dataOffset]), words(per)])
        ])
      ]);
    };
    const size = build(0).length;
    seq--;
    const moof = build(size + 8);
    let bytes = 0;
    const ranges = [];
    t.samples.forEach(function (x) {
      const last = ranges[ranges.length - 1];
      if (last && last[0] + last[1] === x.offset) last[1] += x.size; else ranges.push([x.offset, x.size]);
      bytes += x.size;
    });
    const mdatHead = Buffer.alloc(8);
    mdatHead.writeUInt32BE(8 + bytes, 0);
    mdatHead.write('mdat', 4, 'latin1');
    const duration = t.samples.reduce(function (a, x) { return a + x.duration; }, 0) / t.timescale;
    return { head: Buffer.concat([moof, mdatHead]), ranges: ranges, bytes: bytes, duration: duration, kind: t.kind };
  });

  const video = parts.filter(function (p) { return p.kind === 'vide'; })[0] || parts[0];
  const p = {
    init: init,
    parts: parts,
    length: parts.reduce(function (a, x) { return a + x.head.length + x.bytes; }, 0),
    // the loop length: the video's, so each new copy starts exactly where the last frame ends
    duration: video.duration,
    mime: 'video/mp4; codecs="' + tracks.map(function (t) { return t.codec; }).join(',') + '"'
  };
  cached = { key: key, plan: p };
  return p;
}

// streams the media segment: each track's moof + mdat header, then its sample data from the file
function stream(file, p, res) {
  const queue = [];
  p.parts.forEach(function (part) {
    queue.push(part.head);
    part.ranges.forEach(function (r) { queue.push(r); });
  });
  const fd = fs.openSync(file, 'r');
  let i = 0, closed = false;
  const buf = Buffer.alloc(1 << 20);
  function done() { if (!closed) { closed = true; try { fs.closeSync(fd); } catch (e) { /* closed */ } } }
  function next() {
    if (closed) return;
    while (i < queue.length) {
      const q = queue[i];
      if (Buffer.isBuffer(q)) { i++; if (!res.write(q)) return res.once('drain', next); continue; }
      // a range of the file, in pieces of up to 1 MB
      const n = Math.min(q[1], buf.length);
      fs.read(fd, buf, 0, n, q[0], function (err, got) {
        if (closed) return;
        if (err || !got) { done(); return res.destroy(err || new Error('short read')); }
        q[0] += got; q[1] -= got;
        if (!q[1]) i++;
        if (res.write(Buffer.from(buf.slice(0, got)))) next(); else res.once('drain', next);
      });
      return;
    }
    done();
    res.end();
  }
  res.on('close', done);   // the page went away mid-stream
  next();
}

module.exports = {
  plan: plan,
  // the queue mutates the ranges as it reads, so each response gets its own copy
  stream: function (file, res) {
    const p = plan(file);
    stream(file, { parts: p.parts.map(function (x) { return { head: x.head, ranges: x.ranges.map(function (r) { return r.slice(); }) }; }) }, res);
  }
};
