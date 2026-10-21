const fs = require("fs");
const { execSync } = require("child_process");

const run = (cmd) => execSync(cmd, { stdio: "pipe" }).toString();

// 1. The files main deleted: follow main.
run("git checkout --theirs -- packages/control-plane/src/sandbox/providers/opencomputer-provider.ts packages/control-plane/src/sandbox/providers/opencomputer-provider.test.ts");
run("git rm -q --cached packages/control-plane/src/sandbox/providers/opencomputer-provider.ts packages/control-plane/src/sandbox/providers/opencomputer-provider.test.ts 2>/dev/null || true");

// 2. The sandbox env builder: ours carries Pi's execution runtime mode.
run("git checkout --ours -- packages/control-plane/src/sandbox/sandbox-env.ts");

// 3. The lock file: ours is the newer resolution.
run("git checkout --ours -- packages/modal-infra/uv.lock");

// 4. The README tables: main's rows, plus Pi's Code Mode sandbox package.
for (const file of ["README.md", "README.zh-CN.md"]) {
  let s = fs.readFileSync(file, "utf8");
  // Take main's side of the conflict.
  const ours = s.match(/<<<<<<< HEAD\n([\s\S]*?)=======\n([\s\S]*?)>>>>>>> origin\/main/);
  if (!ours) continue;
  s = s.replace(ours[0], ours[2]);
  // Put Pi's row back.
  if (!s.includes("pi-codemode-sandbox")) {
    s = s.replace(
      /(\| \[e2b-infra\][^\n]*\n)/,
      `$1| [pi-codemode-sandbox](packages/pi-codemode-sandbox) | Isolated QuickJS runtime for Pi Code Mode   |\n`
    );
  }
  fs.writeFileSync(file, s);
}

// 5. The getting-started table: main's, plus Pi's durable switch.
{
  const file = "docs/GETTING_STARTED.md";
  let s = fs.readFileSync(file, "utf8");
  const ours = s.match(/<<<<<<< HEAD\n([\s\S]*?)=======\n([\s\S]*?)>>>>>>> origin\/main/);
  if (ours) {
    s = s.replace(ours[0], ours[2]);
    if (!s.includes("PI_DURABLE_ENABLED")) {
      s = s.replace(
        /(\| `R2_ACCESS_KEY_ID`[^\n]*\n)/,
        `$1| \`PI_DURABLE_ENABLED\`                      | \`true\` enables Pi Durable after the additive \`PiSessionDO\` migration; defaults to \`false\` |\n`
      );
    }
    fs.writeFileSync(file, s);
  }
}

// 6. The control plane's dependencies: main's versions for what main bumped,
//    ours for what Pi added, and the newer of the two where they differ.
{
  const file = "packages/control-plane/package.json";
  const main = JSON.parse(run(`git show origin/main:${file}`));
  const ours = JSON.parse(run(`git show HEAD:${file}`));
  const merged = { ...main, ...ours };
  merged.dependencies = { ...main.dependencies, ...ours.dependencies };
  merged.devDependencies = { ...main.devDependencies, ...ours.devDependencies };
  // Keep the newer range where the two sides disagree on the same package.
  const newer = (a, b) => {
    if (!a) return b;
    if (!b) return a;
    const num = (v) => String(v).match(/\d+/g)?.map(Number) ?? [0];
    const [x, y] = [num(a), num(b)];
    for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
      if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0) ? a : b;
    }
    return a;
  };
  for (const section of ["dependencies", "devDependencies"]) {
    for (const name of Object.keys(merged[section] ?? {})) {
      merged[section][name] = newer(
        ours[section]?.[name],
        main[section]?.[name]
      );
    }
  }
  fs.writeFileSync(file, `${JSON.stringify(merged, null, 2)}\n`);
}

console.log("resolved");
