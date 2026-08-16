import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";


interface CommandLineArguments {
    directory: string | undefined;
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

    const markdownEntries: string[] = [];

    console.log(`JSON files found: ${jsonFiles.length}`);


    for (const file of jsonFiles) {
        const contents = await readFile(file, "utf8");
        const snapshot = JSON.parse(contents);

        const markdownEntry = renderMarkdownEntry(snapshot);

        markdownEntries.push(markdownEntry);
    }

    console.log(`Markdown entries created: ${markdownEntries.length}`);

    const markdownString = markdownEntries.join("\n\n");

    await writeFile(
        outputPath,
        markdownString,
        "utf8",
    );

}

function renderMarkdownEntry(snapshot: any): string {
    const lines: string[] = [];

    lines.push(`## Jump ${snapshot.jumpCount}`);
    lines.push("");
    lines.push(`**Sector:** ${snapshot.sectorType}`);

    if (snapshot.xmlEvents?.length > 0) {
        lines.push("");
        lines.push("### Events");
        lines.push("");

        for (const event of snapshot.xmlEvents) {
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

buildJournal(directory).catch((error: unknown) => {
    console.error("Watcher failed to start:", error);
    process.exitCode = 1;
});