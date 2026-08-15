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

const xmlFileCache = new Map<string, string>();


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

    for (const [xmlFile, contents] of xmlFileCache) {
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

    if (matches.length > 0) {
        console.log(
            `XML cache hit: "${searchText}" (${matches.length} matches)`
        )
        return matches;
    }

    console.log(
        `XML cache miss: "${searchText}" — scanning all XML files`
    );

    for (const xmlFile of xmlFiles) {
        const contents = await readFile(xmlFile, "utf8");
        let searchFrom = 0;
        let thisFileHadAMatch = false;

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
            thisFileHadAMatch = true;
        }
        if (thisFileHadAMatch) {
            xmlFileCache.set(xmlFile, contents);
        }
    }

    return matches;
}

export async function findEventsContainingText(
    xmlFile: string,
    searchText: string,
): Promise<XmlEventMatch[]> {
    const xml = await readFile(xmlFile, "utf8");

    const parser = new XMLParser({
        ignoreAttributes: false,
    });

    const parsedXml = parser.parse(xml);

    const eventNames =
        findNamedEventsContainingText(
            parsedXml.FTL,
            searchText,
        );

    const matches: XmlEventMatch[] = [];

    for (const eventName of eventNames) {
        matches.push({
            searchText,
            xmlFile,
            eventName,
        });
    }

    return matches;
}

function findNamedEventsContainingText(
    node: unknown,
    searchText: string,
    currentEventName?: string,
): string[] {
    const matches: string[] = [];

    if (Array.isArray(node)) {
        for (const item of node) {
            matches.push(
                ...findNamedEventsContainingText(
                    item,
                    searchText,
                    currentEventName,
                ),
            );
        }

        return matches;
    }

    if (
        typeof node !== "object" ||
        node === null
    ) {
        return matches;
    }

    const objectNode =
        node as Record<string, unknown>;

    let eventName = currentEventName;

    if (
        typeof objectNode["@_name"] === "string"
    ) {
        eventName = objectNode["@_name"];
    }

    if (
        objectNode.text === searchText &&
        eventName
    ) {
        matches.push(eventName);
    }

    for (const value of Object.values(objectNode)) {
        matches.push(
            ...findNamedEventsContainingText(
                value,
                searchText,
                eventName,
            ),
        );
    }

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