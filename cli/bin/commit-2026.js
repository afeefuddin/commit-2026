#!/usr/bin/env node
import { spawnSync } from "node:child_process";
const DEFAULT_BASE_URL = "https://first-commit-2026.afeefuddin.com";

const args = process.argv.slice(2);
const [command, ...rest] = args;

const baseUrl = DEFAULT_BASE_URL;

main(command, rest).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function main(cmd, argv) {
  if (cmd === "help" || cmd === "--help" || cmd === "-h") {
    printUsage();
    return;
  }

  if (!cmd || cmd === "commit") {
    const { flags } = parseFlags(argv);
    const name = getFlag(flags, ["name", "author", "a"]);
    const email = getFlag(flags, ["email", "e"]);
    const message = getFlag(flags, ["message", "m"]);

    const commitInput = await promptForCommit({ name, email, message });

    const res = await fetch(`${baseUrl}/commit`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-first-commit-cli": "1",
      },
      body: JSON.stringify({
        author_name: commitInput.name,
        author_email: commitInput.email,
        message: commitInput.message,
      }),
    });

    await handleResponse(res, (data) => {
      const commit = data?.commit;
      if (!commit) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }
      printCommitSuccess(commit);
    });
    return;
  }

  if (cmd === "logs") {
    const { flags } = parseFlags(argv);
    const limitRaw = getFlag(flags, ["n", "limit"]) || "10";
    const limit = Number.parseInt(limitRaw, 10);
    const author = getFlag(flags, ["author", "a"]);
    if (!Number.isFinite(limit) || limit <= 0) {
      console.error("n must be a positive integer.");
      process.exit(1);
    }

    const params = new URLSearchParams({ n: String(limit) });
    if (author) {
      params.set("author", author);
    }

    const res = await fetch(`${baseUrl}/logs?${params.toString()}`, {
      headers: {
        "x-first-commit-cli": "1",
      },
    });

    const wantsJson = Boolean(flags.json);
    await handleResponse(res, (data) => {
      if (wantsJson) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }
      const logs = Array.isArray(data?.logs) ? data.logs : [];
      if (logs.length === 0) {
        console.log("No logs yet.");
        return;
      }
      const output = logs.map(renderGitLogEntry).join("\n");
      outputWithPager(output);
    });
    return;
  }

  console.error(`Unknown command: ${cmd}`);
  printUsage();
  process.exit(1);
}

async function handleResponse(res, onSuccess) {
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    if (data && typeof data === "object" && data.error) {
      throw new Error(data.error);
    }
    throw new Error(`Request failed (${res.status})`);
  }

  onSuccess(data);
}

function parseFlags(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) {
        flags[key] = next;
        i += 1;
      } else {
        flags[key] = true;
      }
      continue;
    }
    if (arg.startsWith("-") && arg.length > 1) {
      const key = arg.slice(1);
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) {
        flags[key] = next;
        i += 1;
      } else {
        flags[key] = true;
      }
      continue;
    }
    positional.push(arg);
  }
  return { flags, positional };
}

function getFlag(flags, keys) {
  for (const key of keys) {
    if (flags[key]) {
      return String(flags[key]);
    }
  }
  return "";
}

async function promptForCommit({ name, email, message }) {
  const { createInterface } = await import("node:readline/promises");
  const { stdin: input, stdout: output } = await import("node:process");
  const { execSync } = await import("node:child_process");
  const rl = createInterface({ input, output });

  const finalMessage = message || (await promptForMessage({ rl }));

  let finalName = name;
  let finalEmail = email;

  if (!finalName || !finalEmail) {
    const detected = detectGitAuthor(execSync);
    if (detected) {
      console.log(
        `${color("purple", "Detected git author:")} ${detected.name} <${detected.email}>`
      );
      const answer = await rl.question(
        color("purple", "Use this author? (Y/n) ")
      );
      if (answer.trim() === "" || answer.trim().toLowerCase() === "y") {
        finalName = finalName || detected.name;
        finalEmail = finalEmail || detected.email;
      }
    }
  }

  finalName =
    finalName || (await rl.question(color("purple", "Author name: ")));
  finalEmail =
    finalEmail || (await rl.question(color("purple", "Author email: ")));
  rl.close();

  if (!finalName.trim() || !finalEmail.trim() || !finalMessage.trim()) {
    console.error("All fields are required.");
    process.exit(1);
  }

  return {
    name: finalName.trim(),
    email: finalEmail.trim(),
    message: finalMessage.trim(),
  };
}

async function promptForMessage({
  rl,
}) {
  const types = [
    "feat",
    "fix",
    "refactor",
    "docs",
    "chore",
    "test",
    "revert",
    "perf",
    "style",
    "build",
    "ci",
  ];

  console.log(
    `${color("pink", "Life change type")} ${color(
      "gray",
      `(${types.join(", ")})`
    )}`
  );
  const typeInput = (await rl.question(color("pink", "> "))).trim();
  const type = types.includes(typeInput) ? typeInput : "feat";

  const scopeInput = (
    await rl.question(color("pink", "Area of life (optional): "))
  ).trim();
  const scope = scopeInput ? `(${scopeInput})` : "";

  console.log(
    color(
      "pink",
      "Write your 2026 commit message (finish with empty line):"
    )
  );
  const lines = [];
  while (true) {
    const line = await rl.question(color("pink", "> "));
    if (line.trim() === "") {
      break;
    }
    lines.push(line);
  }

  if (lines.length === 0) {
    console.error("Aborted: empty commit message.");
    process.exit(1);
  }

  const summary = lines[0].trim();
  const body = lines.slice(1).join("\n");
  return body
    ? `${type}${scope}: ${summary}\n\n${body}`
    : `${type}${scope}: ${summary}`;
}

function detectGitAuthor(execSync) {
  try {
    const name = execSync("git config user.name", {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
    const email = execSync("git config user.email", {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
    if (!name || !email) {
      return null;
    }
    return { name, email };
  } catch {
    return null;
  }
}

function printUsage() {
  console.log(`commit-2026

Usage:
  commit-2026
  commit-2026 commit --name "Ada" --email "ada@lovelace.dev" --message "first commit"
  commit-2026 logs --n 10

Options:
  commit:
    --name, --author, -a
    --email, -e
    --message, -m

  logs:
    --n, --limit
    --author, -a
    --json

Environment:
  FIRST_COMMIT_URL (optional override)
`);
}

function printGitLogEntry(entry) {
  console.log(renderGitLogEntry(entry));
}

function printCommitSuccess(entry) {
  const lines = [
    "┌────────────────────────┐",
    "│  ✓ Commit created!  🎉 │",
    "└────────────────────────┘",
  ];
  console.log(color("green", lines.join("\n")));
  console.log(color("yellow", "🎉 🎊 🎉 🎊 🎉"));
  console.log("");
  printGitLogEntry(entry);
  console.log(color("cyan", "Tip: run `npx commit-2026 logs` to view history."));
  console.log(
    color("cyan", "Tip: run `npx commit-2026 --help` to see all commands.")
  );
}

function color(name, value) {
  if (!process.stdout.isTTY) {
    return value;
  }
  const codes = {
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    cyan: "\x1b[36m",
    green: "\x1b[32m",
    purple: "\x1b[35m",
    pink: "\x1b[95m",
    gray: "\x1b[90m",
    reset: "\x1b[0m",
  };
  return `${codes[name] || ""}${value}${codes.reset}`;
}

function renderGitLogEntry(entry) {
  const hash = String(entry.hash || "");
  const authorName = String(entry.author_name || "");
  const authorEmail = String(entry.author_email || "");
  const date = String(entry.created_at_iso || "");
  const message = String(entry.message || "");

  const lines = [];
  lines.push(`${color("yellow", "commit")} ${color("blue", hash)}`);
  lines.push(
    `${color("cyan", "Author:")} ${authorName} <${color("blue", authorEmail)}>`
  );
  lines.push(`${color("cyan", "Date:  ")} ${date}`);
  lines.push("");
  for (const line of message.split("\n")) {
    lines.push(`    ${line}`);
  }
  lines.push("");
  return lines.join("\n");
}

function outputWithPager(text) {
  if (!process.stdout.isTTY) {
    process.stdout.write(text + "\n");
    return;
  }

  const pager = process.env.PAGER || "less -FRX";
  try {
    const result = spawnSync(pager, {
      shell: true,
      input: text + "\n",
      stdio: ["pipe", "inherit", "inherit"],
    });
    if (result.error) {
      process.stdout.write(text + "\n");
    }
  } catch {
    process.stdout.write(text + "\n");
  }
}
