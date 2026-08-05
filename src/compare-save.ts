import { readFile } from "node:fs/promises";

import {
    parsePlayerShipStart,
    parseSaveHeader,
} from "./save-parser.js";

import {
    findPrintableStrings,
} from "./save-analysis.js"

import type {
    FoundString,
} from "./save-analysis.js"



const BEFORE_FILE =
    String.raw`C:\Code\ftl-journal\ftl-save-archive\session-2026-08-05T01-04-12-192Z\snapshot-0002.sav`;

const AFTER_FILE =
    String.raw`C:\Code\ftl-journal\ftl-save-archive\session-2026-08-05T01-04-12-192Z\snapshot-0003.sav`;

export interface ChangedByteRange {
    startOffset: number;
    endOffset: number;
    length: number;
}

export function findChangedByteRanges(
    before: Buffer,
    after: Buffer,
): ChangedByteRange[] {
    const ranges: ChangedByteRange[] = [];
    const comparableLength = Math.min(
        before.length,
        after.length,
    );

    let rangeStart: number | undefined;

    for (
        let offset = 0;
        offset < comparableLength;
        offset += 1
    ) {
        const changed = before[offset] !== after[offset];

        if (changed && rangeStart === undefined) {
            rangeStart = offset;
        }

        if (!changed && rangeStart !== undefined) {
            ranges.push({
                startOffset: rangeStart,
                endOffset: offset - 1,
                length: offset - rangeStart,
            });

            rangeStart = undefined;
        }
    }

    if (rangeStart !== undefined) {
        ranges.push({
            startOffset: rangeStart,
            endOffset: comparableLength - 1,
            length: comparableLength - rangeStart,
        });
    }

    return ranges;
}

async function compareSaves(): Promise<void> {
    const beforeData = await readFile(BEFORE_FILE);
    const afterData = await readFile(AFTER_FILE);

    const beforeHeader = parseSaveHeader(beforeData);
    const afterHeader = parseSaveHeader(afterData);

    const beforeShip = parsePlayerShipStart(
        beforeData,
        beforeHeader.nextOffset,
    );

    const afterShip = parsePlayerShipStart(
        afterData,
        afterHeader.nextOffset,
    );

    console.log("Save comparison");
    console.log(`Before: ${BEFORE_FILE}`);
    console.log(`After:  ${AFTER_FILE}`);
    console.log();

    let foundDifference = false;

    foundDifference =
        compareField(
            "File size",
            beforeData.length,
            afterData.length,
        ) || foundDifference;

    foundDifference =
        compareField(
            "Ship name",
            beforeHeader.shipName,
            afterHeader.shipName,
        ) || foundDifference;

    foundDifference =
        compareField(
            "Ship blueprint",
            beforeHeader.shipBlueprintId,
            afterHeader.shipBlueprintId,
        ) || foundDifference;

    for (
        let index = 0;
        index < beforeHeader.unknownHeaderValues.length;
        index += 1
    ) {
        foundDifference =
            compareField(
                `Header unknownInt${index + 1}`,
                beforeHeader.unknownHeaderValues[index],
                afterHeader.unknownHeaderValues[index],
            ) || foundDifference;
    }

    foundDifference =
        compareField(
            "Player ship unknownValue1",
            beforeShip.unknownValue1,
            afterShip.unknownValue1,
        ) || foundDifference;

    const beforeStrings = findPrintableStrings(beforeData);
    const afterStrings = findPrintableStrings(afterData);

    const beforeValues = new Set(
        beforeStrings.map((found) => found.value),
    );

    const afterValues = new Set(
        afterStrings.map((found) => found.value),
    );

    const removedStrings = [...beforeValues].filter(
        (value) => !afterValues.has(value),
    );

    const addedStrings = [...afterValues].filter(
        (value) => !beforeValues.has(value),
    );

    if (removedStrings.length > 0) {
        console.log("Removed strings:");

        for (const value of removedStrings) {
            console.log(`  ${value}`);
        }

        console.log();
    }

    if (addedStrings.length > 0) {
        console.log("Added strings:");

        for (const value of addedStrings) {
            console.log(`  ${value}`);
        }

        console.log();
    }

    const changedByteRanges = findChangedByteRanges(
        beforeData,
        afterData,
    );

    console.log();
    console.log("Changed byte ranges:");

    for (const range of changedByteRanges) {
        console.log(
            `  0x${range.startOffset
                .toString(16)
                .toUpperCase()
                .padStart(8, "0")}` +
            ` - 0x${range.endOffset
                .toString(16)
                .toUpperCase()
                .padStart(8, "0")}` +
            `  (${range.length} bytes)`,
        );
    }

    if (!foundDifference) {
        console.log("No differences found in the parsed fields.");
    }
}

function compareField<T>(
    label: string,
    beforeValue: T,
    afterValue: T,
): boolean {
    if (beforeValue === afterValue) {
        return false;
    }

    console.log(`${label}:`);
    console.log(`  Before: ${String(beforeValue)}`);
    console.log(`  After:  ${String(afterValue)}`);
    console.log();

    return true;
}

compareSaves().catch((error: unknown) => {
    console.error("Could not compare save files:", error);
    process.exitCode = 1;
});