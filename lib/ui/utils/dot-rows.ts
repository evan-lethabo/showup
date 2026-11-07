// @ts-nocheck
// Ported verbatim from archive/showup-standalone/js/utils/dot-rows.js. Only the export/import lines were added
// (the original files shared globals through classic <script> tags). Types come later.
export function dotRowsFrom(days, bestId, grown, settled) {
  return days.map(function (d) {
    var dots = [];
    for (var i = 0; i < d.free; i++) {
      var red = i < d.go;
      dots.push({ redCls: 'dot-red glass-red' + (red && grown ? ' is-on' : ''), delay: String(settled || !red ? 0 : i * 40) });
    }
    var spoken = d.time ? d.time.replace(' – ', ' to ') : '';
    return {
      title: d.title,
      time: d.time || '',
      hasTime: !!d.time && d.free > 0,
      dots: dots,
      go: String(d.go),
      free: String(d.free),
      hasFree: d.free > 0,
      noFree: d.free === 0,
      cls: 'dr' + (d.go === 0 ? ' is-dim' : ''),
      numCls: 'dr-go' + (bestId && d.id === bestId ? ' is-best' : ''),
      aria:
        d.free === 0
          ? d.title + ': nobody free'
          : d.title + (spoken ? ', ' + spoken : '') + ': ' + d.go + ' of ' + d.free + ' free would go',
    };
  });
}
