// Static checks of the Windows kit (deploy/windows/*.ps1). PowerShell is not available in this sandbox, so this
// is a careful lint, not a run: encoding, bracket balance (strings / comments / here-strings skipped), PowerShell
// 7-only syntax, every helper that is called is defined, and the security rules of the update design
// (docs/windows/AUDIT.md section D). Real behaviour must be checked on a PC: docs/windows/TEST-CHECKLIST.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const DIR = new URL('../deploy/windows/', import.meta.url);
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.ps1'));
const read = (f) => fs.readFileSync(new URL(f, DIR), 'utf8');

/** Code with strings, comments and here-strings blanked out (same length, newlines kept). */
function codeOnly(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  const blank = (s) => s.replace(/[^\n]/g, ' ');
  while (i < n) {
    const c = src[i];
    const two = src.slice(i, i + 2);
    if (two === '<#') { const j = src.indexOf('#>', i + 2); const end = j < 0 ? n : j + 2; out += blank(src.slice(i, end)); i = end; continue; }
    if (c === '#') { const j = src.indexOf('\n', i); const end = j < 0 ? n : j; out += blank(src.slice(i, end)); i = end; continue; }
    if (two === "@'" || two === '@"') {
      const q = src[i + 1];
      const re = new RegExp(`\\n${q}@`, 'g'); re.lastIndex = i;
      const m = re.exec(src); const end = m ? m.index + 3 : n;
      out += '"' + blank(src.slice(i + 1, end - 1)) + '"'; i = end; continue;
    }
    if (c === "'") {
      let j = i + 1;
      while (j < n) { if (src[j] === "'") { if (src[j + 1] === "'") { j += 2; continue; } break; } j++; }
      out += "'" + blank(src.slice(i + 1, j)) + "'"; i = j + 1; continue;
    }
    if (c === '"') {
      // Skip the whole string, including $( ... ) sub-expressions (their brackets balance on their own).
      let j = i + 1; let depth = 0;
      while (j < n) {
        if (src[j] === '`') { j += 2; continue; }
        if (src[j] === '$' && src[j + 1] === '(') { depth++; j += 2; continue; }
        if (depth > 0 && src[j] === '(') { depth++; j++; continue; }
        if (depth > 0 && src[j] === ')') { depth--; j++; continue; }
        if (depth === 0 && src[j] === '"') { if (src[j + 1] === '"') { j += 2; continue; } break; }
        j++;
      }
      out += '"' + blank(src.slice(i + 1, j)) + '"'; i = j + 1; continue;
    }
    out += c; i++;
  }
  return out;
}

test('the kit has the expected scripts', () => {
  for (const f of ['common.ps1', 'install.ps1', 'server-run.ps1', 'kiosk.ps1', 'update-runner.ps1', 'update-worker.ps1', 'update.ps1', 'uninstall.ps1', 'health-check.ps1']) {
    assert.ok(files.includes(f), f);
  }
});

test('ASCII only (Windows PowerShell 5.1 reads BOM-less files as ANSI) and no byte-order mark', () => {
  for (const f of files) {
    const buf = fs.readFileSync(new URL(f, DIR));
    const bad = [...buf].findIndex((b) => b > 0x7e || (b < 0x20 && b !== 0x0a && b !== 0x0d && b !== 0x09));
    assert.equal(bad, -1, `${f}: non-ASCII byte at offset ${bad}`);
  }
});

test('brackets balance outside strings and comments', () => {
  for (const f of files) {
    const code = codeOnly(read(f));
    const stack = [];
    const pairs = { ')': '(', '}': '{', ']': '[' };
    let line = 1;
    for (const ch of code) {
      if (ch === '\n') line++;
      if ('({['.includes(ch)) stack.push([ch, line]);
      else if (pairs[ch]) {
        const top = stack.pop();
        assert.ok(top && top[0] === pairs[ch], `${f}:${line}: '${ch}' does not match ${top ? `'${top[0]}' from line ${top[1]}` : 'anything'}`);
      }
    }
    assert.equal(stack.length, 0, `${f}: unclosed ${stack.map(([c, l]) => `'${c}'@${l}`).join(', ')}`);
  }
});

test('Windows PowerShell 5.1 syntax only: no && || ?? ?. and no ternary', () => {
  for (const f of files) {
    const code = codeOnly(read(f));
    for (const bad of ['&&', '||', '??', '?.']) assert.equal(code.includes(bad), false, `${f} uses ${bad}`);
    assert.doesNotMatch(code, /\s\?\s[^:]+\s:\s/, `${f} looks like it uses a ternary`);
    assert.doesNotMatch(code, /-Parallel\b|\bclean\s*\{/, f);
  }
});

test('strict and fail-fast: every entry script sets $ErrorActionPreference and strict mode', () => {
  for (const f of files.filter((x) => x !== 'common.ps1')) {
    const src = read(f);
    assert.match(src, /\$ErrorActionPreference = '(Stop|Continue)'/, f);
    assert.ok(/Set-StrictMode -Version 2/.test(src) || /common\.ps1/.test(src), `${f}: strict mode`);
  }
  assert.match(read('common.ps1'), /Set-StrictMode -Version 2/);
});

test('no aliases or eval-like commands', () => {
  for (const f of files) {
    const code = codeOnly(read(f));
    assert.doesNotMatch(code, /\b(Invoke-Expression|iex|curl|wget|Invoke-WebRequest|Invoke-RestMethod)\b/i, f);
    assert.doesNotMatch(code, /(^|[\s;|(])(ls|cat|rm|cp|mv|echo|sc)\s/m, `${f}: alias`);
    assert.doesNotMatch(code, /Remove-Item[^\n]*\$Request[^\n]*-Recurse/, `${f}: recursive delete of the request path`);
  }
});

test('every TT helper that is called is defined (in the script itself or in common.ps1 when it loads it)', () => {
  const defs = (src) => new Set([...src.matchAll(/^\s*function\s+([A-Za-z0-9-]+)/gm)].map((m) => m[1]));
  const common = defs(read('common.ps1'));
  for (const f of files) {
    const src = read(f);
    const own = defs(src);
    const usesCommon = f !== 'update-runner.ps1' && /common\.ps1/.test(src);
    const code = codeOnly(src);
    for (const m of code.matchAll(/\b([A-Z][a-z]+-TT[A-Za-z]+)\b/g)) {
      const name = m[1];
      assert.ok(own.has(name) || (usesCommon && common.has(name)) || (f === 'common.ps1' && common.has(name)), `${f}: ${name} is not defined`);
    }
    for (const m of code.matchAll(/\$script:(TT[A-Za-z]+|Sid[A-Za-z]+|Utf8NoBom)\b/g)) {
      assert.ok(usesCommon || f === 'common.ps1', `${f}: uses $script:${m[1]} without common.ps1`);
      assert.match(read('common.ps1'), new RegExp(`\\$script:${m[1]} = `), `${m[1]} is defined in common.ps1`);
    }
  }
});

// ── the update design (AUDIT.md D) ─────────────────────────────────────────
const runner = read('update-runner.ps1');
const runnerCode = codeOnly(runner);

test('runner (SYSTEM) is self-contained: loads nothing and runs no git/npm from the project folder', () => {
  assert.doesNotMatch(runnerCode, /^\s*\.\s/m, 'no dot-sourcing');
  assert.doesNotMatch(runner, /common\.ps1/);
  assert.doesNotMatch(runnerCode, /&\s*\$git|git\.exe|\bnpm\b|npm-cli|GitPath/i, 'no git / npm as SYSTEM');
  assert.doesNotMatch(runnerCode, /Import-Module|Add-Type/);
  assert.match(runner, /\$Helper = Join-Path \$Updater 'update-helper\.mjs'/, 'the helper copy in the admin-only folder');
});

test('runner never writes into the project folder; it reads HEAD by hand', () => {
  for (const m of runnerCode.matchAll(/WriteAllText\(([^,]+),/g)) {
    assert.doesNotMatch(m[1], /ProjectDir|Request/, `writes to ${m[1]}`);
  }
  assert.match(runner, /function Get-HeadCommit/);
  assert.match(runner, /\$Updater '-' '-'/, 'status goes to the updater folder, no chown');
});

test('runner checks the request before using it, and always deletes it', () => {
  const iReparse = runner.indexOf('ReparsePoint');
  const iOwner = runner.indexOf("$LocalServiceSid = 'S-1-5-19'");
  const iValidate = runner.indexOf('$Helper validate');
  assert.ok(iOwner > 0 && iReparse > 0 && iValidate > iReparse, 'reparse + owner checks come before validate');
  assert.match(runner, /GetOwner\(\[System\.Security\.Principal\.SecurityIdentifier\]\)/);
  assert.match(runner, /\$item\.Length -gt 4096/);
  assert.match(runner, /if \(\$refuse\) \{ Say "Request refused: \$refuse\."; Remove-Request; exit 0 \}/);
  assert.match(runner, /\$validRc = \$LASTEXITCODE\s+\$ErrorActionPreference = 'Stop'\s+Remove-Request/);
  assert.match(runner, /\[System\.IO\.Directory\]::Delete\(\$Request, \$false\)/, 'a folder/junction is removed without recursing');
});

test('runner: stops (and disables) the server before the worker, and always brings it back', () => {
  const iStop = runner.indexOf("Say 'Stopping the server");
  const iWorker = runner.indexOf('$rc = Invoke-Worker');
  assert.ok(iStop > 0 && iWorker > iStop);
  assert.match(runner, /function Stop-Server \{\s+Disable-ScheduledTask/);
  assert.match(runner, /\} finally \{\s+# Never leave the screen without a server\./);
  assert.match(runner, /Enable-ScheduledTask -TaskPath \$TaskPath -TaskName \$ServerTask/);
  assert.match(runner, /Backup-Data\s+Say 'Stopping the server/);
  assert.match(runner, /\/XJ/, 'robocopy never follows junctions');
  assert.match(runner, /\$age -lt 120/, 'no second run within 2 minutes');
});

test('runner: rollback target only from its own previous-commit file; worker re-checks the hash', () => {
  assert.match(runner, /\$prevFile = Join-Path \$State 'previous-commit'/);
  assert.match(runner, /if \(\$action -eq 'rollback'\) \{ \$mode = 'rollback'; \$target = \$Previous \}/);
  const worker = read('update-worker.ps1');
  assert.match(worker, /\$target -notmatch '\^\[0-9a-f\]\{40\}\$'/);
  assert.match(worker, /\$mode -ne 'update' -and \$mode -ne 'rollback'/);
  assert.match(read('common.ps1'), /\$Mode -eq 'rollback' -and \$Target -notmatch '\^\[0-9a-f\]\{40\}\$'/);
  assert.match(read('common.ps1'), /'pull --ff-only'/);
});

const install = read('install.ps1');

test('install: tasks run as LOCAL SERVICE / NETWORK SERVICE / SYSTEM / the kiosk user, never stop on a time limit', () => {
  assert.match(install, /TTServerTask[\s\S]{0,700}SidLocalService\) -LogonType ServiceAccount -RunLevel Limited/);
  assert.match(install, /TTWorkerTask[\s\S]{0,500}SidNetworkService\) -LogonType ServiceAccount -RunLevel Limited/);
  assert.match(install, /TTUpdateTask[\s\S]{0,700}SidSystem\) -LogonType ServiceAccount -RunLevel Highest/);
  assert.match(install, /-UserId \$KioskUser -LogonType Interactive -RunLevel Limited/);
  assert.equal((install.match(/-ExecutionTimeLimit \(\[TimeSpan\]::Zero\)/g) || []).length, 2, 'server + kiosk run forever');
  assert.equal((install.match(/-MultipleInstances IgnoreNew/g) || []).length, 4);
  assert.match(install, /update-runner\.ps1'\) \+ '"'\) -WorkingDirectory \$script:TTUpdaterDir/, 'SYSTEM runs the admin-only copy');
  assert.doesNotMatch(install, /-Priority 7/, 'default task priority (below normal) is not used');
});

test('install: data\\ is not readable by ordinary users; LOCAL SERVICE can write only data\\ and its log folder', () => {
  const dataLine = install.split('\n').find((l) => l.includes('Set-Acl2 $dataDir'));
  assert.ok(dataLine);
  assert.doesNotMatch(dataLine, /gUsr|gKiosk/);
  assert.match(dataLine, /\$\{gLS\}:\(OI\)\(CI\)M/);
  const codeLine = install.split('\n').find((l) => l.includes('Set-Acl2 $InstallDir'));
  assert.match(codeLine, /\$\{gLS\}:\(OI\)\(CI\)RX/);
  assert.doesNotMatch(codeLine, /\$\{gLS\}:\(OI\)\(CI\)M/);
  const lsWrites = install.split('\n').filter((l) => /Set-Acl2/.test(l) && /\$\{gLS\}:\(OI\)\(CI\)M/.test(l));
  assert.equal(lsWrites.length, 2, 'data + logs\\server only');
  assert.match(install, /Set-Acl2 \(Join-Path \$script:TTUpdaterDir 'state'\) @\("\$\{gSys\}:\(OI\)\(CI\)F", "\$\{gAdm\}:\(OI\)\(CI\)F"\)/);
});

test('install: firewall only on Private networks + local subnet; never re-runs setup.js over an existing login', () => {
  assert.match(install, /-Profile Private -RemoteAddress LocalSubnet/);
  assert.match(install, /if \(-not \(Test-Path -LiteralPath \(Join-Path \$dataDir 'users\.json'\)\) -and -not \(Test-Path -LiteralPath \(Join-Path \$dataDir 'auth\.json'\)\)\)/);
  assert.match(install, /OneDrive/);
  assert.match(install, /Stop-TTServer -ProjectDir \$InstallDir[\s\S]*npm-cli|\$npmCli/);
  assert.ok(install.indexOf('Stop-TTServer -ProjectDir $InstallDir') < install.indexOf('ci --no-audit'), 'server stopped before npm ci (DLLs in use)');
});

test('kiosk: Edge full-screen kiosk on 127.0.0.1 with its own profile; never --remote-debugging-port', () => {
  const k = read('kiosk.ps1');
  assert.match(k, /'--kiosk', \$Url, '--edge-kiosk-type=fullscreen'/);
  assert.match(k, /--user-data-dir=/);
  assert.match(k, /http:\/\/127\.0\.0\.1:\$port\/screen/);
  assert.doesNotMatch(k, /localhost:/, 'localhost may resolve to ::1 first on Windows');
  assert.doesNotMatch(k, /remote-debugging/);
  assert.match(k, /api\/screen\/state/);
  assert.match(k, /SetThreadExecutionState/);
});

test('server-run: restarts node, logs per start, clears a leftover node first', () => {
  const s = read('server-run.ps1');
  assert.match(s, /while \(\$true\)/);
  assert.match(s, /-RedirectStandardOutput \$out -RedirectStandardError \$err/);
  assert.match(s, /Get-TTServerNodeProcesses -ProjectDir \$projectDir/);
  assert.match(s, /\$null = \$p\.Handle/, 'PowerShell 5.1 ExitCode quirk');
});

test('the tokenizer itself: strings, comments and here-strings are skipped', () => {
  const c = codeOnly("a ' ( ' b \" ) $(x) \" # (\n<# { #> @'\n(\n'@ c");
  assert.equal(c.replace(/\s+/g, ''), 'a\'\'b' + '"'.repeat(4) + 'c', 'each string and the here-string leave an empty pair of quotes');
  assert.equal(codeOnly("'it''s'").length, "'it''s'".length);
});

test('docs: the Windows docs exist', () => {
  for (const f of ['AUDIT.md', 'SETUP.md', 'TEST-CHECKLIST.md', 'RISKS.md']) {
    assert.ok(fs.existsSync(path.join(new URL('../docs/windows/', import.meta.url).pathname, f)), f);
  }
});
