import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { marked } from "marked";

import type { SnapshotMetadata } from "./process-snapshot.js";

import type {
    XmlEventMatch
} from "./xml-search.js"

interface CommandLineArguments {
    directory: string | undefined;
}

interface JournalJump {
    jumpCount: number;
    sectorType: string;
    events: XmlEventMatch[];
}

const commandLineArguments = parseCommandLineArguments()

const directory = commandLineArguments.directory;

function parseCommandLineArguments(): CommandLineArguments {
    const userArguments = process.argv.slice(2);

    let directory: string | undefined;

    for (let index = 0; index < userArguments.length; index++) {
        const argument = userArguments[index];

        if (argument === "--directory") {
            const nextArgument = userArguments[index + 1];

            if (!nextArgument || nextArgument.startsWith("--")) {
                throw new Error("--directory requires a directory name.");
            }

            directory = nextArgument;
            index += 1;
            continue;
        }

        throw new Error(`Unknown argument: ${argument}`);
    }

    return {
        directory
    };
}

export async function findJsonFiles(directory: string | undefined):
    Promise<string[]> {
    if (!directory) {
        throw new Error("No directory was provided.");
    }

    const entries = await readdir(directory, {
        withFileTypes: true,
    });

    const files: string[] = [];

    for (const entry of entries) {
        const jsonSidecar = path.join(directory, entry.name);

        if (
            entry.name.endsWith(".json")
        ) {
            files.push(jsonSidecar);
        }
    }

    return files.sort();
}

async function buildJournal(
    directory: string | undefined
): Promise<void> {
    if (!directory) {
        throw new Error("No directory was provided.");
    }

    const outputPath = path.join(directory, "z-journal.md");
    const jsonFiles = await findJsonFiles(directory);

    const snapshots: SnapshotMetadata[] = [];

    console.log(`JSON files found: ${jsonFiles.length}`);

    for (const file of jsonFiles) {
        const contents = await readFile(file, "utf8");
        const snapshot = JSON.parse(contents) as SnapshotMetadata;

        snapshots.push(snapshot);
    }

    const journalJumps = buildJournalJumps(snapshots);

    const markdownEntries = journalJumps.map(
        (jump) => renderMarkdownEntry(jump)
    );

    console.log(`Journal jumps created: ${journalJumps.length}`);

    const markdownString = markdownEntries.join("\n\n");

    await writeFile(
        outputPath,
        markdownString,
        "utf8",
    );

    const htmlString = await renderHtmlJournal(journalJumps);

    const htmlOutputPath = path.join(directory, "z-journal.html");

    await writeFile(
        htmlOutputPath,
        htmlString,
        "utf8",
    );
}

function buildJournalJumps(
    snapshots: SnapshotMetadata[]
): JournalJump[] {
    const journalJumps: JournalJump[] = [];

    for (const snapshot of snapshots) {
        const previousJump = journalJumps.at(-1);

        if (
            previousJump &&
            previousJump.jumpCount === snapshot.jumpCount
        ) {
            previousJump.events.push(...snapshot.xmlEvents);
            continue;
        }

        journalJumps.push({
            jumpCount: snapshot.jumpCount,
            sectorType: snapshot.sectorType,
            events: [...snapshot.xmlEvents],
        });
    }

    return journalJumps;
}

function renderMarkdownEntry(jump: JournalJump): string {
    const lines: string[] = [];

    lines.push(`## Jump ${jump.jumpCount}`);
    lines.push("");
    lines.push(`**Sector:** ${jump.sectorType}`);

    if (jump.events.length > 0) {
        lines.push("");
        lines.push("### Events");
        lines.push("");

        for (const event of jump.events) {
            if (event.searchText) {
                lines.push(`- ${event.searchText}`);
            }

            if (event.eventName) {
                lines.push(`  - Event: ${event.eventName}`);
            }
        }
    }

    return lines.join("\n");
}

async function renderHtmlJournal(
    journalJumps: JournalJump[]
): Promise<string> {
    const htmlJumpEntries = await Promise.all(
        journalJumps.map(async (jump, index) => {
            const markdown = renderMarkdownEntry(jump);
            const html = await marked(markdown);

            return `
            <section
                class="journal-jump"
                data-jump-index="${index}"
                ${index === 0 ? "" : "hidden"}
            >
                ${html}
            </section>`;
        })
    );

    const jumpOptions = journalJumps
        .map(
            (jump, index) =>
                `<option value="${index}">Jump ${jump.jumpCount}</option>`
        )
        .join("\n");

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>FTL Journal</title>
</head>
<body>
    <nav>
        <button id="previous-jump">Previous Jump</button>

        <select id="jump-selector">
            ${jumpOptions}
        </select>

        <button id="next-jump">Next Jump</button>
    </nav>

    <main>
        ${htmlJumpEntries.join("\n")}
    </main>
    <script>
    const jumps = Array.from(
        document.querySelectorAll(".journal-jump")
    );

    const previousButton =
        document.getElementById("previous-jump");

    const nextButton =
        document.getElementById("next-jump");

    const jumpSelector =
        document.getElementById("jump-selector");

    let currentJumpIndex = 0;

    function showJump(index) {
        if (index < 0 || index >= jumps.length) {
            return;
        }

        jumps[currentJumpIndex].hidden = true;

        currentJumpIndex = index;

        jumps[currentJumpIndex].hidden = false;
        jumpSelector.value = String(currentJumpIndex);

        previousButton.disabled = currentJumpIndex === 0;
        nextButton.disabled =
            currentJumpIndex === jumps.length - 1;
    }

    previousButton.addEventListener("click", () => {
        showJump(currentJumpIndex - 1);
    });

    nextButton.addEventListener("click", () => {
        showJump(currentJumpIndex + 1);
    });

    jumpSelector.addEventListener("change", () => {
        showJump(Number(jumpSelector.value));
    });

    showJump(0);
</script>
</body>
</html>`;
}



buildJournal(directory).catch((error: unknown) => {
    console.error("Journal build failed:", error);
    process.exitCode = 1;
});