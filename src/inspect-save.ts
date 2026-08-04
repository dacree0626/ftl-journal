import "dotenv/config";
import { readFile } from "node:fs/promises";
import {
    parseInitialCrew,
    parsePlayerShipStart,
    parseSaveHeader,
} from "./save-parser.js";

import type {
    ParsedInitialCrew,
    ParsedPlayerShipStart,
    ParsedSaveHeader,
} from "./save-parser.js";

import {
    findPrintableStrings,
} from "./save-analysis.js"

import type {
    FoundString,
} from "./save-analysis.js"



import { parse } from "node:path";

const commandLineArguments = parseCommandLineArguments();

const SAVE_FILE =
    commandLineArguments.saveFile ??
    getRequiredEnvironmentVariable("SAVE_FILE");

const searchTerm = commandLineArguments.searchTerm;

const contextBytes =
    commandLineArguments.contextBytes;

const BYTES_PER_ROW = 16;
const BYTES_TO_DISPLAY = 256;

interface SaveStatistic {
    name: string;
    value: number;
}



interface CommandLineArguments {
    saveFile: string | undefined;
    searchTerm: string | undefined;
    contextBytes: number | undefined;
}

function parseCommandLineArguments(): CommandLineArguments {
    const userArguments = process.argv.slice(2);

    let saveFile: string | undefined;
    let searchTerm: string | undefined;
    let contextBytes: number | undefined;

    for (let index = 0; index < userArguments.length; index++) {
        const argument = userArguments[index];

        if (argument === "--find") {
            searchTerm = userArguments[index + 1];
            index += 1;
            continue;
        }

        if (argument === "--context") {
            const nextArgument = userArguments[index + 1];

            if (nextArgument) {
                contextBytes = Number.parseInt(
                    nextArgument,
                    10
                );
            }

            index += 1;
            continue;
        }

        saveFile = argument;
    }

    return {
        saveFile,
        searchTerm,
        contextBytes
    };
}
function getRequiredEnvironmentVariable(name: string): string {
    const value = process.env[name];

    if (!value) {
        throw new Error(`${name} is not configured in the .env file.`);
    }

    return value;
}

function formatHexByte(value: number): string {
    return value.toString(16).padStart(2, "0").toUpperCase();
}

function formatPrintableByte(value: number): string {
    return value >= 32 && value <= 126
        ? String.fromCharCode(value)
        : ".";
}

// display parsed objects, save
function printSaveHeader(header: ParsedSaveHeader): void {
    header.unknownHeaderValues.forEach((value, index) => {
        console.log(`unknownInt${index + 1}: ${value}`);
    });

    console.log(`shipName: ${header.shipName}`);
    console.log(`shipBlueprintId: ${header.shipBlueprintId}`);
    console.log(`unknownInt9: ${header.unknownInt9}`);
    console.log(`unknownInt10: ${header.unknownInt10}`);
    console.log(`statCount: ${header.statistics.length}`);
    console.log("stats:");

    for (const statistic of header.statistics) {
        console.log(`  ${statistic.name}: ${statistic.value}`);
    }

    console.log(`nextOffset: ${header.nextOffset}`);
}

function printStringMatchContext(
    buffer: Buffer,
    foundString: FoundString,
    searchTerm: string,
    contextBytes: number,
): void {
    const matchIndex = foundString.value
        .toLowerCase()
        .indexOf(searchTerm.toLowerCase());

    const matchOffset =
        foundString.offset +
        Math.max(matchIndex, 0);

    const contextStart = Math.max(
        0,
        matchOffset - contextBytes,
    );

    const contextEnd = Math.min(
        buffer.length,
        matchOffset +
        searchTerm.length +
        contextBytes,
    );

    const byteCount = contextEnd - contextStart;

    console.log();
    console.log(
        `Context around match at 0x${matchOffset
            .toString(16)
            .toUpperCase()}:`,
    );
    console.log();

    printHexDumpFromOffset(
        buffer,
        contextStart,
        byteCount,
    );
}

// Optional reverse-engineering diagnostics.
// These are not used by the default inspector output.
function printHexDumpFromOffset(
    buffer: Buffer,
    startOffset: number,
    byteCount: number,
): void {
    const endOffset = Math.min(buffer.length, startOffset + byteCount);

    for (
        let offset = startOffset;
        offset < endOffset;
        offset += BYTES_PER_ROW
    ) {
        const row = buffer.subarray(
            offset,
            Math.min(offset + BYTES_PER_ROW, endOffset),
        );

        const offsetText = offset
            .toString(16)
            .padStart(8, "0")
            .toUpperCase();

        const hexText = Array.from(row)
            .map(formatHexByte)
            .join(" ")
            .padEnd(BYTES_PER_ROW * 3 - 1, " ");

        const printableText = Array.from(row)
            .map(formatPrintableByte)
            .join("");

        console.log(`${offsetText}  ${hexText}  |${printableText}|`);
    }
}

function printInt32DumpFromOffset(
    buffer: Buffer,
    startOffset: number,
    valueCount: number,
): void {
    let offset = startOffset;

    for (let index = 0; index < valueCount; index += 1) {
        if (offset + 4 > buffer.length) {
            break;
        }

        const value = buffer.readInt32LE(offset);
        const offsetHex = offset
            .toString(16)
            .padStart(8, "0")
            .toUpperCase();

        const rawBytes = buffer
            .subarray(offset, offset + 4)
            .toString("hex")
            .match(/.{2}/g)
            ?.join(" ")
            .toUpperCase();

        console.log(
            `${offsetHex}  ${rawBytes ?? ""}  ${value}`,
        );

        offset += 4;
    }
}

// display unknown bytes for investigation
function printHexDump(buffer: Buffer): void {
    const bytesToRead = Math.min(buffer.length, BYTES_TO_DISPLAY);

    for (let offset = 0; offset < bytesToRead; offset += BYTES_PER_ROW) {
        const row = buffer.subarray(
            offset,
            Math.min(offset + BYTES_PER_ROW, bytesToRead),
        );

        const offsetText = offset
            .toString(16)
            .padStart(8, "0")
            .toUpperCase();

        const hexText = Array.from(row)
            .map(formatHexByte)
            .join(" ")
            .padEnd(BYTES_PER_ROW * 3 - 1, " ");

        const printableText = Array.from(row)
            .map(formatPrintableByte)
            .join("");

        console.log(`${offsetText}  ${hexText}  |${printableText}|`);
    }
}
// End of optional diagnostics

// display parsed objects, ship
function printPlayerShipStart(ship: ParsedPlayerShipStart): void {
    console.log("Player ship section:");
    console.log(`unknownValue1: ${ship.unknownValue1}`);
    console.log(`unknownValue2: ${ship.unknownValue2}`);
    console.log(`blueprintId: ${ship.blueprintId}`);
    console.log(`shipName: ${ship.shipName}`);
    console.log(`unknownShipId: ${ship.unknownShipId}`);
    console.log(`nextOffset: ${ship.nextOffset}`);
}


function printInitialCrew(initialCrew: ParsedInitialCrew): void {
    console.log("Initial crew:");

    if (initialCrew.members.length === 0) {
        console.log("  None");
    } else {
        for (const member of initialCrew.members) {
            console.log(`  ${member.name} (${member.species})`);
        }
    }

    console.log(`nextOffset: ${initialCrew.nextOffset}`);
}

function findPrintableStringsInRange(
    buffer: Buffer,
    startOffset: number,
    byteCount: number,
    minimumLength = 4,
): FoundString[] {
    const endOffset = Math.min(
        buffer.length,
        startOffset + byteCount,
    );

    const slice = buffer.subarray(startOffset, endOffset);

    return findPrintableStrings(slice, minimumLength).map(
        (found) => ({
            offset: found.offset + startOffset,
            value: found.value,
        }),
    );
}

function printFoundStrings(strings: FoundString[]): void {
    for (const found of strings) {
        const offsetHex = found.offset
            .toString(16)
            .padStart(8, "0")
            .toUpperCase();

        console.log(`${offsetHex}  ${found.value}`);
    }
}

function findStringMatches(
    strings: FoundString[],
    searchTerm: string,
): FoundString[] {
    const normalizedSearchTerm = searchTerm.toLowerCase();

    return strings.filter((found) =>
        found.value.toLowerCase().includes(normalizedSearchTerm),
    );
}

// reads the file
// coordinates everything
async function inspectSave(): Promise<void> {
    const saveData = await readFile(SAVE_FILE);
    const foundStrings = findPrintableStrings(saveData);

    console.log(`File: ${SAVE_FILE}`);
    console.log(`Size: ${saveData.length} bytes`);
    console.log(`Showing first ${Math.min(saveData.length, BYTES_TO_DISPLAY)} bytes`);
    console.log();

    console.log("Parsed fields:");
    console.log();

    const parsedHeader = parseSaveHeader(saveData);
    printSaveHeader(parsedHeader);

    console.log();

    const playerShipStart = parsePlayerShipStart(
        saveData,
        parsedHeader.nextOffset,
    );

    printPlayerShipStart(playerShipStart);

    const parsedInitialCrew = parseInitialCrew(
        saveData,
        playerShipStart.nextOffset,
    );

    console.log();
    console.log("Initial Crew Info:");
    printInitialCrew(parsedInitialCrew);
    console.log();

    console.log();
    console.log(
        `Unknown data beginning at ${parsedInitialCrew.nextOffset}:`,
    );
    console.log();
    printHexDumpFromOffset(
        saveData,
        parsedInitialCrew.nextOffset,
        1024,
    );

    const frontierStrings = findPrintableStringsInRange(
        saveData,
        parsedInitialCrew.nextOffset,
        1024,
    );

    console.log();
    console.log("Printable strings near parser frontier:");
    console.log();

    printFoundStrings(frontierStrings);

    if (searchTerm) {
        const foundStrings = findPrintableStrings(saveData);
        const matches = findStringMatches(foundStrings, searchTerm);

        console.log();
        console.log(`String matches for "${searchTerm}":`);
        console.log();

        if (matches.length === 0) {
            console.log("No matches found.");
        } else {
            printFoundStrings(matches);

            if (contextBytes !== undefined) {
                for (const match of matches) {
                    printStringMatchContext(
                        saveData,
                        match,
                        searchTerm,
                        contextBytes,
                    );
                }
            }
        }
    }

    // console.log(`Bytes beginning at nextOffset (${playerShipStart.nextOffset}):`);
    // console.log();

    // console.log();
    // console.log("Printable strings found in entire save:");
    // console.log();

    // printFoundStrings(foundStrings);

    //     printInt32DumpFromOffset(
    //         saveData,
    //         playerShipStart.nextOffset,
    //         40,
    //     );

    //     printHexDumpFromOffset(
    //         saveData,
    //         playerShipStart.nextOffset,
    //         256,
    //     );

    //     console.log();
    //     console.log("Raw hex:");
    //     console.log();

    //     printHexDump(saveData);
}


inspectSave().catch((error: unknown) => {
    console.error("Could not inspect the save file:", error);
    process.exitCode = 1;
});