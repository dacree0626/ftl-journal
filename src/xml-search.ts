import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { XMLParser } from "fast-xml-parser";

export interface XmlTextMatch {
    searchText: string;
    xmlFile: string;
    occurrenceIndex: number;
}

export interface XmlEventMatch {
    searchText: string;
    xmlFile: string;
    eventName: string;
}

interface ParsedXmlEvent {
    text?: string;
    "@_name"?: string;
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

        let searchFrom = 0;

        while (true) {
            const occurrenceIndex = contents.indexOf(
                searchText,
                searchFrom,
            );

            if (occurrenceIndex === -1) {
                break;
            }

            matches.push({
                searchText,
                xmlFile,
                occurrenceIndex,
            });

            searchFrom =
                occurrenceIndex + searchText.length;
        }
    }

    return matches;
}

export async function findEventsContainingText(
    xmlFile: string,
    searchText: string,
): Promise<XmlEventMatch[]> {
    console.log("ENTERED findEventsContainingText");
    console.log("xmlFile:", xmlFile);
    console.log("searchText:", searchText);
    // read file
    const xml = await readFile(xmlFile, "utf8");
    // parse XML
    const parser = new XMLParser({
        ignoreAttributes: false,
    });
    const parsedXml = parser.parse(xml);
    // inspect events
    const events = findAllEvents(parsedXml.FTL);

    console.log("Events found:", events.length);

    const eventsContainingSearchText = events.filter((event) =>
        JSON.stringify(event).includes(searchText)
    );

    console.dir(eventsContainingSearchText, {
        depth: null,
    });

    const matches: XmlEventMatch[] = [];

    for (const event of events) {
        if (
            event.text === searchText &&
            event["@_name"]
        ) {
            matches.push({
                searchText,
                xmlFile,
                eventName: event["@_name"],
            });
        }
    }


    // return matching event names
    return matches;

}

function findAllEvents(
    node: unknown,
    events: ParsedXmlEvent[] = [],
): ParsedXmlEvent[] {
    if (Array.isArray(node)) {
        for (const item of node) {
            findAllEvents(item, events);
        }

        return events;
    }

    if (
        typeof node !== "object" ||
        node === null
    ) {
        return events;
    }

    const objectNode =
        node as Record<string, unknown>;

    for (const [key, value] of Object.entries(objectNode)) {
        if (key === "event") {
            if (Array.isArray(value)) {
                for (const event of value) {
                    if (
                        typeof event === "object" &&
                        event !== null
                    ) {
                        events.push(
                            event as ParsedXmlEvent
                        );
                    }
                }
            } else if (
                typeof value === "object" &&
                value !== null
            ) {
                events.push(
                    value as ParsedXmlEvent
                );
            }
        }

        findAllEvents(value, events);
    }

    return events;
}