import "dotenv/config";
import { readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import {
    parseSaveHeader,
    parseSectorState,
    parseInitialCrew,
    parsePlayerShipStart,
    findDialogueCandidates,
    isDialogueCandidate
} from "./save-parser.js";

import type {
    DialogueCandidateContext,
    CrewMember,
    ParsedInitialCrew,
    ParsedPlayerShipStart
} from "./save-parser.js"

import {
    findPrintableStrings
} from "./save-analysis.js";

import type {
    FoundString
} from "./save-analysis.js";

import {
    findXmlFilesContainingText,
    findXmlFiles,
    findEventsContainingText
} from "./xml-search.js"

import type {
    XmlTextMatch,
    XmlEventMatch
} from "./xml-search.js";

export type SnapshotTrigger =
    | "session-start"
    | "filesystem-change"
    | "manual";

export interface SnapshotMetadata {
    snapshotFile: string;
    trigger: SnapshotTrigger;
    capturedAt: string;
    sourceModifiedAt: string;
    sourceSize: number;
    jumpCount: number;
    sectorType: string;
    currentBeaconIndex: number | null;
    dialogueCandidates: string[];
    dialogueInXml: XmlTextMatch[];
    xmlEvents: XmlEventMatch[]
}


export interface SnapshotCaptureDetails {
    trigger: SnapshotTrigger;
    capturedAt: Date;
    sourceModifiedAt: Date;
    sourceSize: number;
}

function getRequiredEnvironmentVariable(name: string): string {
    const value = process.env[name];

    if (!value) {
        throw new Error(`${name} is not configured in the .env file.`);
    }

    return value;
}

export async function processSnapshot(
    saveFile: string,
    captureDetails: SnapshotCaptureDetails,
): Promise<SnapshotMetadata> {
    const saveData = await readFile(saveFile);

    const saveHeader = parseSaveHeader(saveData);
    const sectorState = parseSectorState(saveData);
    const playerShip = parsePlayerShipStart(saveData, saveHeader.nextOffset);
    const crewNames = parseInitialCrew(saveData, playerShip.nextOffset);

    const printableStrings = findPrintableStrings(saveData);

    const allStrings = printableStrings.map(
        (foundString) => foundString.value,
    );

    const jumpCount =
        saveHeader.unknownHeaderValues[5];

    if (jumpCount === undefined) {
        throw new Error(
            "Could not read the jump count from the save header.",
        );
    }



    const dialogueContext: DialogueCandidateContext = {
        crewNames: crewNames.members.map((member) => member.name),
        shipName: playerShip.shipName,
        shipBlueprintId: playerShip.blueprintId,
    };

    const dialogueCandidates = findDialogueCandidates(
        allStrings,
        dialogueContext,
    );

    const multiverseDataDirectory =
        getRequiredEnvironmentVariable(
            "MULTIVERSE_DATA_DIRECTORY",
        );

    const xmlFiles = await findXmlFiles(
        multiverseDataDirectory,
    );

    const dialogueInXml: XmlTextMatch[] = [];

    for (const dialogueCandidate of dialogueCandidates) {
        const matches = await findXmlFilesContainingText(
            xmlFiles,
            dialogueCandidate,
        );

        dialogueInXml.push(...matches);
    }

    const xmlEvents: XmlEventMatch[] = [];

    for(const xmlMatch of dialogueInXml) {
        const eventMatch = await findEventsContainingText(
            xmlMatch.xmlFile,
            xmlMatch.searchText
        )
        xmlEvents.push(...eventMatch)
    }

    const metadata: SnapshotMetadata = {
        snapshotFile: basename(saveFile),
        trigger: captureDetails.trigger,
        capturedAt: captureDetails.capturedAt.toISOString(),
        sourceModifiedAt:
            captureDetails.sourceModifiedAt.toISOString(),
        sourceSize: captureDetails.sourceSize,
        jumpCount,
        sectorType: sectorState.sectorType,
        currentBeaconIndex:
            sectorState.currentBeaconIndex,
        dialogueCandidates,
        dialogueInXml,
        xmlEvents
    };

    const sidecarFile = join(
        dirname(saveFile),
        `${basename(saveFile, ".sav")}.json`,
    );

    await writeFile(
        sidecarFile,
        JSON.stringify(metadata, null, 2),
        "utf8",
    );

    return metadata;
}


const requestedSaveFile = process.argv[2];

if (requestedSaveFile !== undefined) {
    const saveStats = await stat(requestedSaveFile);

    processSnapshot(
        requestedSaveFile,
        {
            trigger: "manual",
            capturedAt: saveStats.mtime,
            sourceModifiedAt: saveStats.mtime,
            sourceSize: saveStats.size,
        },
    )
        .then((metadata) => {
            console.log("Snapshot processed:");
            console.log(metadata);
        })
        .catch((error: unknown) => {
            console.error(
                "Could not process snapshot:",
                error,
            );

            process.exitCode = 1;
        });
}