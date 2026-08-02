import { watch } from "node:fs";
import { copyFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";

const SAVE_FILE = String.raw`C:\Users\dacre\OneDrive\Documents\My Games\FasterThanLight\hs_mv_continue.sav`;
const ARCHIVE_DIRECTORY = path.resolve("ftl-save-archive");
const STABILITY_DELAY_MS = 300;
const MAX_STABILITY_CHECKS = 10;

let snapshotNumber = 0;
let copyTimer: NodeJS.Timeout | undefined;
let lastSavedModifiedTime = 0;



function createTimestamp(): string {
    return new Date()
        .toISOString()
        .replaceAll(":", "-")
        .replaceAll(".", "-");
}

async function waitForStableSave(): Promise<boolean> {
    for (let attempt = 0; attempt < MAX_STABILITY_CHECKS; attempt += 1) {
        const firstCheck = await stat(SAVE_FILE);

        await new Promise((resolve) => {
            setTimeout(resolve, STABILITY_DELAY_MS);
        });

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

async function archiveSave(): Promise<void> {
    try {
        const saveStats = await stat(SAVE_FILE);

        if (saveStats.mtimeMs === lastSavedModifiedTime) {
            return;
        }

        lastSavedModifiedTime = saveStats.mtimeMs;
        snapshotNumber += 1;

        await mkdir(ARCHIVE_DIRECTORY, { recursive: true });

        const extension = path.extname(SAVE_FILE);
        const timestamp = createTimestamp();

        const archiveName =
            `snapshot-${String(snapshotNumber).padStart(4, "0")}-${timestamp}${extension}`;

        const archivePath = path.join(ARCHIVE_DIRECTORY, archiveName);

        await copyFile(SAVE_FILE, archivePath);

        console.log(
            `Saved snapshot ${snapshotNumber} at ${new Date().toLocaleTimeString()}`
        );
        console.log(`File modified: ${saveStats.mtime.toLocaleTimeString()}`);
        console.log(archivePath);
    } catch (error) {
        console.error("Could not archive the save file:", error);
    }
}

async function startWatching(): Promise<void> {
    await mkdir(ARCHIVE_DIRECTORY, { recursive: true });

    console.log("Watching FTL save file:");
    console.log(SAVE_FILE);
    console.log();
    console.log("Archive directory:");
    console.log(ARCHIVE_DIRECTORY);
    console.log();
    console.log("Press Ctrl+C to stop.");

    await archiveSave();

    const saveDirectory = path.dirname(SAVE_FILE);
    const saveFileName = path.basename(SAVE_FILE);

    watch(saveDirectory, (_eventType, changedFileName) => {
        if (changedFileName !== saveFileName) {
            return;
        }

        if (copyTimer) {
            clearTimeout(copyTimer);
        }

        copyTimer = setTimeout(() => {
            void (async () => {
                const fileIsStable = await waitForStableSave();

                if (!fileIsStable) {
                    console.error("Save file did not become stable.");
                    return;
                }

                await archiveSave();
            })();
        }, 300);
    });
}

startWatching().catch((error: unknown) => {
    console.error("Watcher failed to start:", error);
    process.exitCode = 1;
});