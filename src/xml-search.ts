import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

export interface XmlTextMatch {
    searchText: string;
    xmlFile: string;
}


export async function findXmlFiles(directory: string): Promise<string[]> {
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

export async function findXmlFilesContainingText(
    xmlFiles: string[],
    searchText: string,
): Promise<XmlTextMatch[]> {
    const matches: XmlTextMatch[] = [];

    for (const xmlFile of xmlFiles) {
        const contents = await readFile(xmlFile, "utf8");

        if (contents.includes(searchText)) {
            matches.push({
                searchText,
                xmlFile,
            });
        }
    }

    return matches;
}