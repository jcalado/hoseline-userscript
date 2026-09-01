// Builds hoseline-redesign.user.js and hoseline-redesign.user.css from hoseline.css
const fs = require('fs');
const path = require('path');
const VERSION = '2.0.0';
const dir = __dirname;
const out = path.join(dir, '..');   // the installables ship from the repo root
const css = fs.readFileSync(path.join(dir, 'hoseline.css'), 'utf8');

// userscript
const tpl = fs.readFileSync(path.join(dir, 'userscript.template.js'), 'utf8');
const js = tpl.replace('__VERSION__', VERSION).replace('__CSS__', JSON.stringify(css));
fs.writeFileSync(path.join(out, 'hoseline-redesign.user.js'), js);

// userstyle (Stylus)
const header = `/* ==UserStyle==
@name           Hoseline Redesign
@namespace      https://github.com/joelcalado/hoseline-redesign
@version        ${VERSION}
@description    Cleaner cards, nav and filter bar for hose.brandmeister.network, and the player as a floating corner card. CSS-only: the card only appears while the player popover is open (click PLAYER), it cannot switch between the idle pill and the full on-air card, and dark mode follows your OS setting. Install the .user.js version for the live QSO card with callsign, talkgroup name, timer and level meter.
@author         Joel Calado
@license        MIT
==/UserStyle== */
@-moz-document domain("hose.brandmeister.network") {
`;
const indented = css.split('\n').map(l => (l ? '  ' + l : l)).join('\n');
fs.writeFileSync(path.join(out, 'hoseline-redesign.user.css'), header + indented + '\n}\n');

console.log('built', VERSION, 'css bytes', css.length);
