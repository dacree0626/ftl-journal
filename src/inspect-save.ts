import "dotenv/config";
import { readFile } from "node:fs/promises";
import {
    parseInitialCrew,
    parsePlayerShipStart,
    parseSaveHeader,
    parseSectorState
} from "./save-parser.js";

import type {
    ParsedInitialCrew,
    ParsedPlayerShipStart,
    ParsedSaveHeader,
    ParsedSectorState,
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
const requestedOffset = commandLineArguments.offset;
const requestedLength = commandLineArguments.length;
const int32SearchValue = commandLineArguments.int32SearchValue;

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
    offset: number | undefined;
    length: number | undefined;
    int32SearchValue: number | undefined;
}

function parseCommandLineArguments(): CommandLineArguments {
    const userArguments = process.argv.slice(2);

    let saveFile: string | undefined;
    let searchTerm: string | undefined;
    let contextBytes: number | undefined;
    let offset: number | undefined;
    let length: number | undefined;
    let int32SearchValue: number | undefined;

    for (
        let index = 0;
        index < userArguments.length;
        index += 1
    ) {
        const argument = userArguments[index];

        if (argument === undefined) {
            continue;
        }

        if (argument === "--find") {
            const value = userArguments[index + 1];

            if (value === undefined || value.startsWith("--")) {
                throw new Error("--find requires a search term.");
            }

            searchTerm = value;
            index += 1;
            continue;
        }

        if (argument === "--context") {
            const value = userArguments[index + 1];

            if (value === undefined || value.startsWith("--")) {
                throw new Error("--context requires a value.");
            }

            contextBytes = parseNumericArgument(
                value,
                "--context",
            );

            index += 1;
            continue;
        }

        if (argument === "--offset") {
            const value = userArguments[index + 1];

            if (value === undefined || value.startsWith("--")) {
                throw new Error("--offset requires a value.");
            }

            offset = parseNumericArgument(
                value,
                "--offset",
            );

            index += 1;
            continue;
        }

        if (argument === "--length") {
            const value = userArguments[index + 1];

            if (value === undefined || value.startsWith("--")) {
                throw new Error("--length requires a value.");
            }

            length = parseNumericArgument(
                value,
                "--length",
            );

            index += 1;
            continue;
        }

        if (argument === "--find-int32") {
            const value = userArguments[index + 1];

            if (value === undefined || value.startsWith("--")) {
                throw new Error("--find-int32 requires a value.");
            }

            int32SearchValue = parseNumericArgument(
                value,
                "--find-int32",
            );

            index += 1;
            continue;
        }

        if (argument.startsWith("--")) {
            throw new Error(
                `Unknown inspect-save argument: ${argument}`,
            );
        }

        if (saveFile !== undefined) {
            throw new Error(
                `Unexpected positional argument: ${argument}`,
            );
        }

        saveFile = argument;
    }

    return {
        saveFile,
        searchTerm,
        contextBytes,
        offset,
        length,
        int32SearchValue,
    };
}

function parseNumericArgument(
    value: string,
    argumentName: string,
): number {
    const radix = value.toLowerCase().startsWith("0x")
        ? 16
        : 10;

    const normalizedValue =
        radix === 16
            ? value.slice(2)
            : value;

    const parsedValue = Number.parseInt(
        normalizedValue,
        radix,
    );

    if (Number.isNaN(parsedValue) || parsedValue < 0) {
        throw new Error(
            `${argumentName} requires a non-negative number.`,
        );
    }

    return parsedValue;
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

function findInt32Matches(
    buffer: Buffer,
    searchValue: number,
    startOffset = 0,
    length = buffer.length - startOffset,
): number[] {
    const matches: number[] = [];

    const endOffset = Math.min(
        startOffset + length,
        buffer.length,
    );

    for (
        let offset = startOffset;
        offset <= endOffset - 4;
        offset += 1
    ) {
        const value = buffer.readInt32LE(offset);

        if (value === searchValue) {
            matches.push(offset);
        }
    }

    return matches;
}

function printInt32Matches(
    buffer: Buffer,
    searchValue: number,
    startOffset: number,
    length: number,
): void {
    const matches = findInt32Matches(
        buffer,
        searchValue,
        startOffset,
        length,
    );

    console.log();
    console.log(
        `Int32 matches for ${searchValue}:`,
    );

    if (matches.length === 0) {
        console.log("No matches found.");
        return;
    }

    for (const matchOffset of matches) {
        console.log(
            `  0x${matchOffset
                .toString(16)
                .toUpperCase()
                .padStart(8, "0")}`,
        );
    }
}

// reads the file
// coordinates everything
async function inspectSave(): Promise<void> {
    const saveData = await readFile(SAVE_FILE);
    const foundStrings = findPrintableStrings(saveData);

    console.log(`File: ${SAVE_FILE}`);
    // console.log(`Size: ${saveData.length} bytes`);
    // console.log(`Showing first ${Math.min(saveData.length, BYTES_TO_DISPLAY)} bytes`);
    // console.log();

    // console.log("Parsed fields:");
    // console.log();

    // const parsedHeader = parseSaveHeader(saveData);
    // printSaveHeader(parsedHeader);

    // console.log();

    // const playerShipStart = parsePlayerShipStart(
    //     saveData,
    //     parsedHeader.nextOffset,
    // );

    // printPlayerShipStart(playerShipStart);

    // const parsedInitialCrew = parseInitialCrew(
    //     saveData,
    //     playerShipStart.nextOffset,
    // );

    // console.log();
    // console.log("Initial Crew Info:");
    // printInitialCrew(parsedInitialCrew);
    // console.log();

    // console.log();
    // console.log(
    //     `Unknown data beginning at ${parsedInitialCrew.nextOffset}:`,
    // );
    // console.log();
    // printHexDumpFromOffset(
    //     saveData,
    //     parsedInitialCrew.nextOffset,
    //     1024,
    // );

    // const frontierStrings = findPrintableStringsInRange(
    //     saveData,
    //     parsedInitialCrew.nextOffset,
    //     1024,
    // );

    // console.log();
    // console.log("Printable strings near parser frontier:");
    // console.log();

    // printFoundStrings(frontierStrings);

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

    if (requestedOffset !== undefined) {
        const lengthToDisplay =
            requestedLength ?? BYTES_TO_DISPLAY;

        console.log();
        printHexDumpFromOffset(
            saveData,
            requestedOffset,
            lengthToDisplay,
        );
    }

    if (int32SearchValue !== undefined && requestedOffset) {
        const lengthToDisplay =
            requestedLength ?? BYTES_TO_DISPLAY;
        findInt32Matches(
            saveData,
            int32SearchValue,
        );
        console.log();
        printInt32Matches(
            saveData,
            int32SearchValue,
            requestedOffset,
            lengthToDisplay
        )
    }

    const sectorState = parseSectorState(saveData);

    console.log();
    console.log("Sector state:");
    console.log(`sectorType: ${sectorState.sectorType}`);
    console.log(
        `currentBeaconIndex: ${sectorState.currentBeaconIndex}`,
    );
    console.log(
        `sectorTypeOffset: 0x${sectorState.sectorTypeOffset
            .toString(16)
            .toUpperCase()}`,
    );
    console.log(
        `currentBeaconIndexOffset: 0x${sectorState.currentBeaconIndexOffset
            .toString(16)
            .toUpperCase()}`,
    );

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