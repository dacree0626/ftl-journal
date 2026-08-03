import "dotenv/config";

import { readFile } from "node:fs/promises";

interface SaveStatistic {
    name: string;
    value: number;
}

interface ParsedStatistics {
    values: SaveStatistic[];
    nextOffset: number;
}

interface ParsedSaveHeader {
    unknownHeaderValues: number[];
    shipName: string;
    shipBlueprintId: string;
    unknownInt9: number;
    unknownInt10: number;
    statistics: SaveStatistic[];
    nextOffset: number;
}

interface ParsedPlayerShipStart {
    unknownValue1: number;
    unknownValue2: number;
    blueprintId: string;
    shipName: string;
    unknownShipId: string;
    nextOffset: number;
}

interface FoundString {
    offset: number;
    value: string;
}

function getRequiredEnvironmentVariable(name: string): string {
    const value = process.env[name];

    if (!value) {
        throw new Error(`${name} is not configured in the .env file.`);
    }

    return value;
}

const commandLineArguments = parseCommandLineArguments();

const SAVE_FILE =
    commandLineArguments.saveFile ??
    getRequiredEnvironmentVariable("SAVE_FILE");

const searchTerm = commandLineArguments.searchTerm;

const BYTES_PER_ROW = 16;
const BYTES_TO_DISPLAY = 256;

function formatHexByte(value: number): string {
    return value.toString(16).padStart(2, "0").toUpperCase();
}

function formatPrintableByte(value: number): string {
    return value >= 32 && value <= 126
        ? String.fromCharCode(value)
        : ".";
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

// decode individual binary values
function readString(
    buffer: Buffer,
    offset: number,
): { value: string; nextOffset: number } {
    const length = buffer.readInt32LE(offset);
    const stringStart = offset + 4;
    const stringEnd = stringStart + length;

    return {
        value: buffer.toString("utf8", stringStart, stringEnd),
        nextOffset: stringEnd,
    };
}

// parses the first known section
function parseSaveHeader(buffer: Buffer): ParsedSaveHeader {
    let offset = 0;
    const unknownHeaderValues: number[] = [];

    for (let index = 0; index < 8; index += 1) {
        const result = readInt32(buffer, offset);

        unknownHeaderValues.push(result.value);
        offset = result.nextOffset;
    }

    const shipNameResult = readString(buffer, offset);
    offset = shipNameResult.nextOffset;

    const shipBlueprintResult = readString(buffer, offset);
    offset = shipBlueprintResult.nextOffset;

    const unknownInt9Result = readInt32(buffer, offset);
    offset = unknownInt9Result.nextOffset;

    const unknownInt10Result = readInt32(buffer, offset);
    offset = unknownInt10Result.nextOffset;

    const statCountResult = readInt32(buffer, offset);
    offset = statCountResult.nextOffset;

    const statisticsResult = parseStatistics(
        buffer,
        offset,
        statCountResult.value,
    );

    return {
        unknownHeaderValues,
        shipName: shipNameResult.value,
        shipBlueprintId: shipBlueprintResult.value,
        unknownInt9: unknownInt9Result.value,
        unknownInt10: unknownInt10Result.value,
        statistics: statisticsResult.values,
        nextOffset: statisticsResult.nextOffset,
    };
}

// decode individual binary values
function readInt32(
    buffer: Buffer,
    offset: number,
): { value: number; nextOffset: number } {
    return {
        value: buffer.readInt32LE(offset),
        nextOffset: offset + 4,
    };
}

// parses the repeated stat entries
function parseStatistics(
    buffer: Buffer,
    offset: number,
    count: number,
): ParsedStatistics {
    const values: SaveStatistic[] = [];

    for (let index = 0; index < count; index += 1) {
        const nameResult = readString(buffer, offset);
        offset = nameResult.nextOffset;

        const valueResult = readInt32(buffer, offset);
        offset = valueResult.nextOffset;

        values.push({
            name: nameResult.value,
            value: valueResult.value,
        });
    }

    return {
        values,
        nextOffset: offset,
    };
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

// parses the beginning of the next section
function parsePlayerShipStart(
    buffer: Buffer,
    startOffset: number,
): ParsedPlayerShipStart {
    let offset = startOffset;

    const unknownValue1Result = readInt32(buffer, offset);
    offset = unknownValue1Result.nextOffset;

    const unknownValue2Result = readInt32(buffer, offset);
    offset = unknownValue2Result.nextOffset;

    const blueprintIdResult = readString(buffer, offset);
    offset = blueprintIdResult.nextOffset;

    const shipNameResult = readString(buffer, offset);
    offset = shipNameResult.nextOffset;

    const unknownShipIdResult = readString(buffer, offset);
    offset = unknownShipIdResult.nextOffset;

    return {
        unknownValue1: unknownValue1Result.value,
        unknownValue2: unknownValue2Result.value,
        blueprintId: blueprintIdResult.value,
        shipName: shipNameResult.value,
        unknownShipId: unknownShipIdResult.value,
        nextOffset: offset,
    };
}

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

function findPrintableStrings(
    buffer: Buffer,
    minimumLength = 4,
): FoundString[] {
    const results: FoundString[] = [];
    let startOffset: number | undefined;

    for (let offset = 0; offset <= buffer.length; offset += 1) {
        const byte = buffer[offset];

        const isPrintable =
            byte !== undefined &&
            byte >= 32 &&
            byte <= 126;

        if (isPrintable && startOffset === undefined) {
            startOffset = offset;
        }

        if (!isPrintable && startOffset !== undefined) {
            const length = offset - startOffset;

            if (length >= minimumLength) {
                results.push({
                    offset: startOffset,
                    value: buffer.toString(
                        "utf8",
                        startOffset,
                        offset,
                    ),
                });
            }

            startOffset = undefined;
        }
    }

    return results;
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

interface CommandLineArguments {
    saveFile: string | undefined;
    searchTerm: string | undefined;
}

function parseCommandLineArguments(): CommandLineArguments {
    const userArguments = process.argv.slice(2);

    let saveFile: string | undefined;
    let searchTerm: string | undefined;

    // parser...

    for (let index = 0; index < userArguments.length; index++) {
        if (userArguments[index] === "--find") {
            searchTerm = userArguments[index + 1];
            break;
        }
        else {
            saveFile = userArguments[index]
        }
    }

    return {
        saveFile,
        searchTerm,
    };
}

inspectSave().catch((error: unknown) => {
    console.error("Could not inspect the save file:", error);
    process.exitCode = 1;
});