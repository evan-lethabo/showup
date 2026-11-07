// @ts-nocheck
// Ported verbatim from archive/showup-standalone/js/utils/conditions-parser.js. Only the export/import lines were added
// (the original files shared globals through classic <script> tags). Types come later.
import { NUMWORDS, STOPWORDS } from '../data/constants';
export function parseConditions(raw, group) {
  var orig = (raw || '').replace(/[‘’`]/g, "'").replace(/\s+/g, ' ').trim();
  var t = orig.toLowerCase();
  if (!t) return { status: 'empty', chips: [] };
  if (/n't\b|\bnot\b|\bnever\b|\bunless\b|\bwithout\b|\bnobody\b|\bno one\b|\bexcept\b|\bavoid|\bor\b|\beither\b/.test(t))
    return { status: 'unsupported', chips: [] };
  var chips = [];
  var seen = {};
  var add = function (name, known) {
    var k = name.toLowerCase();
    if (seen[k]) return;
    seen[k] = true;
    chips.push({ type: 'person', name: name, known: known });
  };
  if (group) {
    group.forEach(function (n) {
      if (new RegExp('\\b' + n.toLowerCase() + '\\b').test(t)) add(n, true);
    });
  }
  var pre =
    /\b([A-Z][a-z]{1,20})(?:'s|\s+is|\s+are|\s+will)?\s+(?:be\s+)?(?:going|goes|go|comes|coming|come|attends|attending|there|in)\b/g;
  var pm;
  while ((pm = pre.exec(orig)) !== null) {
    var nm = pm[1];
    if (STOPWORDS.indexOf(nm) >= 0) continue;
    add(
      nm,
      group
        ? group.some(function (g) {
            return g.toLowerCase() === nm.toLowerCase();
          })
        : true,
    );
  }
  var re =
    /(at least|a minimum of|minimum of|more than|over)?\s*\b(\d+|two|three|four|five|six|seven|eight|nine|ten)\b\s*(or more|\+)?\s*(people|persons|others|friends|of us|guests|come|attend|show|going|turn)?/g;
  var m;
  while ((m = re.exec(t)) !== null) {
    if (!m[1] && !m[3] && !m[4]) continue;
    var n = NUMWORDS[m[2]] || parseInt(m[2], 10);
    if (m[1] === 'more than' || m[1] === 'over') n = n + 1;
    chips.push({ type: 'min', n: String(Math.max(2, Math.min(20, n))) });
    break;
  }
  return { status: chips.length ? 'ok' : 'none', chips: chips };
}
