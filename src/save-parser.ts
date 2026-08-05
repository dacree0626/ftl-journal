export interface ParsedInteger {
    value: number;
    nextOffset: number;
}

export interface ParsedString {
    value: string;
    nextOffset: number;
}

export interface SaveStatistic {
    name: string;
    value: number;
}

export interface ParsedStatistics {
    values: SaveStatistic[];
    nextOffset: number;
}

export interface ParsedSaveHeader {
    unknownHeaderValues: number[];
    shipName: string;
    shipBlueprintId: string;
    unknownInt9: number;
    unknownInt10: number;
    statistics: SaveStatistic[];
    nextOffset: number;
}

export interface ParsedPlayerShipStart {
    unknownValue1: number;
    unknownValue2: number;
    blueprintId: string;
    shipName: string;
    unknownShipId: string;
    nextOffset: number;
}

export interface CrewMember {
    species: string;
    name: string;
}

export interface ParsedInitialCrew {
    members: CrewMember[];
    nextOffset: number;
}

export interface ParsedSectorState {
    sectorType: string;
    currentBeaconIndex: number;
    sectorTypeOffset: number;
    currentBeaconIndexOffset: number;
}

const CURRENT_BEACON_INDEX_RELATIVE_OFFSET = 0x4B;

/**
 * Provisional parser for known sector state.
 *
 * currentBeaconIndex was identified experimentally and is
 * currently read at a known relative offset from the sector
 * type string. Replace this with sequential parsing once the
 * intervening sector fields are understood.
 */

export function parseSectorState(
    buffer: Buffer,
): ParsedSectorState {
    const sectorType = "CIVILIAN_SECTOR";

    const sectorTypeOffset = buffer.indexOf(
        sectorType,
        0,
        "utf8",
    );

    if (sectorTypeOffset === -1) {
        throw new Error(
            `Could not find sector identifier: ${sectorType}`,
        );
    }

    const currentBeaconIndexOffset =
        sectorTypeOffset +
        CURRENT_BEACON_INDEX_RELATIVE_OFFSET;

    if (currentBeaconIndexOffset + 4 > buffer.length) {
        throw new Error(
            "Current beacon index would be outside the save file.",
        );
    }

    const currentBeaconIndexResult = readInt32(
        buffer,
        currentBeaconIndexOffset,
    );

    if (
        currentBeaconIndexResult.value < 0 ||
        currentBeaconIndexResult.value > 1000
    ) {
        throw new Error(
            `Parsed an implausible current beacon index: ` +
            `${currentBeaconIndexResult.value}`,
        );
    }

    return {
        sectorType,
        currentBeaconIndex:
            currentBeaconIndexResult.value,
        sectorTypeOffset,
        currentBeaconIndexOffset,
    };
}

// decode individual binary values
export function readString(
    buffer: Buffer,
    offset: number,
): ParsedString {
    const length = buffer.readInt32LE(offset);
    const stringStart = offset + 4;
    const stringEnd = stringStart + length;

    return {
        value: buffer.toString("utf8", stringStart, stringEnd),
        nextOffset: stringEnd,
    };
}

// decode individual binary values
export function readInt32(
    buffer: Buffer,
    offset: number,
): ParsedInteger {
    return {
        value: buffer.readInt32LE(offset),
        nextOffset: offset + 4,
    };
}

// parses the first known section
export function parseSaveHeader(buffer: Buffer): ParsedSaveHeader {
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

// parses the repeated stat entries
export function parseStatistics(
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

// parses the beginning of the next section
export function parsePlayerShipStart(
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

export function parseInitialCrew(
    buffer: Buffer,
    startOffset: number,
): ParsedInitialCrew {
    let offset = startOffset;

    const crewCountResult = readInt32(buffer, offset);
    offset = crewCountResult.nextOffset;

    const members: CrewMember[] = [];

    for (
        let index = 0;
        index < crewCountResult.value;
        index += 1
    ) {
        const speciesResult = readString(buffer, offset);
        offset = speciesResult.nextOffset;

        const nameResult = readString(buffer, offset);
        offset = nameResult.nextOffset;

        members.push({
            species: speciesResult.value,
            name: nameResult.value,
        });
    }

    return {
        members,
        nextOffset: offset,
    };
}

