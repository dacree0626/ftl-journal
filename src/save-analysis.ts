export interface FoundString {
    offset: number;
    value: string;
}

export function findPrintableStrings(
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