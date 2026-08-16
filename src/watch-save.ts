/**
 * Watches the active FTL: Multiverse save file and archives stable copies.
 *
 * Each watcher launch creates a separate session directory. Every detected
 * save change is copied into that session as a numbered snapshot.
 */

import { watch } from "node:fs";
import { copyFile, mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import "dotenv/config";
import {
    processSnapshot
} from "./process-snapshot.js"

import {
    buildJournal
} from "./build-journal.js"

import {
    notifyJournalUpdated,
    startJournalServer
} from "./journal-server.js"

function getRequiredEnvironmentVariable(name: string): string {
    const value = process.env[name];

    if (!value) {
        throw new Error(`${name} is not configured in the .env file.`);
    }

    return value;
}


const SAVE_FILE = getRequiredEnvironmentVariable("SAVE_FILE");
const ARCHIVE_ROOT_DIRECTORY = path.resolve("ftl-save-archive");
const STABILITY_DELAY_MS = 300;
const MAX_STABILITY_CHECKS = 10;
const sessionId = createTimestamp();
const SESSION_DIRECTORY = path.join(
    ARCHIVE_ROOT_DIRECTORY,
    `session-${sessionId}`,
);

interface SnapshotMetadata {
    sessionId: string;
    snapshotNumber: number;
    trigger: "session-start" | "filesystem-change";
    capturedAt: string;
    sourceModifiedAt: string;
    millisecondsSincePreviousSnapshot: number | null;
    fileSizeBytes: number;
    sourceFile: string;
    archiveFile: string;
    interpretation: "unknown";
}

let snapshotNumber = 0;
let copyTimer: NodeJS.Timeout | undefined;
let lastSavedModifiedTime = 0;
let previousSnapshotCapturedAt: number | undefined;

function createTimestamp(): string {
    return new Date()
        .toISOString()
        .replaceAll(":", "-")
        .replaceAll(".", "-");
}

function sleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, milliseconds);
    });
}

/**
 * Checks the save repeatedly until its size and modification time stop
 * changing. This reduces the risk of copying while FTL is still writing.
 */
async function waitForStableSave(): Promise<boolean> {
    for (let attempt = 1; attempt <= MAX_STABILITY_CHECKS; attempt += 1) {
        const firstCheck = await stat(SAVE_FILE);

        await sleep(STABILITY_DELAY_MS);

        const secondCheck = await stat(SAVE_FILE);

        const fileIsStable =
            firstCheck.size === secondCheck.size &&
            firstCheck.mtimeMs === secondCheck.mtimeMs;

        if (fileIsStable) {
            return true;
        }
    }

    return false;
}

async function archiveSave(
    trigger: "session-start" | "filesystem-change",
): Promise<void> {
    try {
        const saveStats = await stat(SAVE_FILE);

        // Ignore duplicate notifications for the same completed file write.
        if (saveStats.mtimeMs === lastSavedModifiedTime) {
            return;
        }

        lastSavedModifiedTime = saveStats.mtimeMs;
        snapshotNumber += 1;

        const extension = path.extname(SAVE_FILE);
        const paddedSnapshotNumber =
            String(snapshotNumber).padStart(4, "0");

        const snapshotName =
            `snapshot-${paddedSnapshotNumber}${extension}`;

        const archivePath = path.join(
            SESSION_DIRECTORY,
            snapshotName,
        );

        const capturedAt = new Date();

        await copyFile(
            SAVE_FILE,
            archivePath,
        );

        await processSnapshot(
            archivePath,
            {
                trigger,
                capturedAt,
                sourceModifiedAt: saveStats.mtime,
                sourceSize: saveStats.size,
            },
        );

        await buildJournal(SESSION_DIRECTORY);
        notifyJournalUpdated();

        console.log(
            `Saved snapshot ${snapshotNumber} at ` +
            `${new Date().toLocaleTimeString()}`,
        );
        console.log(
            `File modified: ` +
            `${saveStats.mtime.toLocaleTimeString()}`,
        );
        console.log(archivePath);
        console.log();
    } catch (error) {
        console.error(
            "Could not archive the save file:",
            error,
        );
    }
}

async function processSaveChange(): Promise<void> {
    try {
        const fileIsStable = await waitForStableSave();

        if (!fileIsStable) {
            console.error(
                `Save file did not become stable after ${MAX_STABILITY_CHECKS} checks.`,
            );
            return;
        }

        await archiveSave("filesystem-change");
    } catch (error) {
        console.error("Could not process the save-file change:", error);
    }
}

async function startWatching(): Promise<void> {
    await mkdir(SESSION_DIRECTORY, { recursive: true });

    startJournalServer(SESSION_DIRECTORY);

    console.log("Watching FTL save file:");
    console.log(SAVE_FILE);
    console.log();

    console.log("Session ID:");
    console.log(sessionId);
    console.log();

    console.log("Session directory:");
    console.log(SESSION_DIRECTORY);
    console.log();

    console.log("Press Ctrl+C to stop.");
    console.log();

    // Preserve the save state that existed when this watcher session began.
    await archiveSave("session-start");

    const saveDirectory = path.dirname(SAVE_FILE);
    const saveFileName = path.basename(SAVE_FILE);

    /*
     * Watch the containing directory rather than the save file itself.
     * Applications may replace a file during saving, which can invalidate a
     * watcher attached directly to the original file.
     */
    watch(saveDirectory, (_eventType, changedFileName) => {
        if (changedFileName !== saveFileName) {
            return;
        }

        /*
         * Windows can emit many notifications for one logical save. Resetting this
         * timer groups the notification burst into one processing attempt.
         */
        if (copyTimer) {
            clearTimeout(copyTimer);
        }

        copyTimer = setTimeout(() => {
            void processSaveChange();
        }, STABILITY_DELAY_MS);
    });
}

function createSnapshotMetadata(
    trigger: "session-start" | "filesystem-change",
    capturedAt: Date,
    sourceModifiedAt: Date,
    fileSizeBytes: number,
    archiveFile: string,
): SnapshotMetadata {
    const capturedAtMilliseconds = capturedAt.getTime();

    const millisecondsSincePreviousSnapshot =
        previousSnapshotCapturedAt === undefined
            ? null
            : capturedAtMilliseconds - previousSnapshotCapturedAt;

    const metadata: SnapshotMetadata = {
        sessionId,
        snapshotNumber,
        trigger,
        capturedAt: capturedAt.toISOString(),
        sourceModifiedAt: sourceModifiedAt.toISOString(),
        millisecondsSincePreviousSnapshot,
        fileSizeBytes,
        sourceFile: SAVE_FILE,
        archiveFile,
        interpretation: "unknown",
    };

    previousSnapshotCapturedAt = capturedAtMilliseconds;

    return metadata;
}

async function writeSnapshotMetadata(
    metadata: SnapshotMetadata,
    metadataPath: string,
): Promise<void> {
    const json = JSON.stringify(metadata, null, 2);

    await writeFile(metadataPath, json, "utf8");
}

startWatching().catch((error: unknown) => {
    console.error("Watcher failed to start:", error);
    process.exitCode = 1;
});