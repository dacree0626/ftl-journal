import "dotenv/config";

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

interface CommandLineArguments {
    searchText: string | undefined;
    fileName: string | undefined;
}

const multiverseDataDirectory =
    getRequiredEnvironmentVariable(
        "MULTIVERSE_DATA_DIRECTORY",
    );

const commandLineArguments = parseCommandLineArguments()

const eventFile =
    commandLineArguments.fileName ??
    "No File Provided"

const searchText = commandLineArguments.searchText;


function getRequiredEnvironmentVariable(name: string): string {
    const value = process.env[name];

    if (!value) {
        throw new Error(`${name} is not configured in the .env file.`);
    }

    return value;
}

function parseCommandLineArguments(): CommandLineArguments {
    const userArguments = process.argv.slice(2);

    let searchText: string | undefined;
    let fileName: string | undefined;

    for (let index = 0; index < userArguments.length; index++) {
        const argument = userArguments[index];

        if (argument === "--text") {
            const nextArgument = userArguments[index + 1];

            if (!nextArgument || nextArgument.startsWith("--")) {
                throw new Error("--text requires a search value.");
            }

            searchText = nextArgument;
            index += 1;
            continue;
        }

        if (argument === "--file") {
            const nextArgument = userArguments[index + 1];

            if (!nextArgument || nextArgument.startsWith("--")) {
                throw new Error("--file requires a filename.");
            }

            fileName = nextArgument;
            index += 1;
            continue;
        }

        throw new Error(`Unknown argument: ${argument}`);
    }

    return {
        searchText,
        fileName,
    };
}

async function findXmlFiles(directory: string): Promise<string[]> {
    const entries = await readdir(directory, {
        withFileTypes: true,
    });

    const files: string[] = [];

    for (const entry of entries) {
        const entryPath = path.join(directory, entry.name);

        if (entry.isDirectory()) {
            const nestedFiles = await findXmlFiles(entryPath);
            files.push(...nestedFiles);
            continue;
        }

        if (
            entry.name.endsWith(".xml") ||
            entry.name.endsWith(".xml.append")
        ) {
            files.push(entryPath);
        }
    }

    return files;
}


async function lookupEvent(): Promise<void> {
    if (!searchText) {
        throw new Error("No search text was provided.");
    }

    const xmlFiles = await findXmlFiles(
        multiverseDataDirectory,
    );

    const matchingFiles: string[] = [];

    for (const xmlFile of xmlFiles) {
        const contents = await readFile(xmlFile, "utf8");

        if (contents.includes(searchText)) {
            matchingFiles.push(xmlFile);
        }
    }

    console.log("Search Text");
    console.log(searchText);
    console.log();

    console.log("Matching Files");

    if (matchingFiles.length === 0) {
        console.log("No matches found.");
        return;
    }

    for (const matchingFile of matchingFiles) {
        console.log(matchingFile);
    }
}

lookupEvent().catch((error: unknown) => {
    console.error("Could not lookup event:", error);
    process.exitCode = 1;
});