
let jumps = Array.from(
    document.querySelectorAll(".journal-jump")
);

const previousButton =
    document.getElementById("previous-jump");

const nextButton =
    document.getElementById("next-jump");

const jumpSelector =
    document.getElementById("jump-selector");

let currentJumpIndex = jumps.length - 1;

function showJump(index) {
    if (index < 0 || index >= jumps.length) {
        return;
    }

    jumps[currentJumpIndex].hidden = true;

    currentJumpIndex = index;

    jumps[currentJumpIndex].hidden = false;
    jumpSelector.value = String(currentJumpIndex);

    previousButton.disabled = currentJumpIndex === 0;
    nextButton.disabled =
        currentJumpIndex === jumps.length - 1;
}

previousButton.addEventListener("click", () => {
    showJump(currentJumpIndex - 1);
});

nextButton.addEventListener("click", () => {
    showJump(currentJumpIndex + 1);
});

jumpSelector.addEventListener("change", () => {
    showJump(Number(jumpSelector.value));
});

showJump(jumps.length - 1);

const events = new EventSource("/events");

events.addEventListener("journal-updated", async () => {
    const response = await fetch("/");
    const updatedHtml = await response.text();

    const parser = new DOMParser();
    const updatedDocument =
        parser.parseFromString(updatedHtml, "text/html");

    const updatedMain =
        updatedDocument.querySelector("main");

    const updatedJumpSelector =
        updatedDocument.getElementById("jump-selector");

    if (!updatedMain || !updatedJumpSelector) {
        return;
    }

    document.querySelector("main").innerHTML =
        updatedMain.innerHTML;

    jumpSelector.innerHTML =
        updatedJumpSelector.innerHTML;

    jumps = Array.from(
        document.querySelectorAll(".journal-jump")
    );

    showJump(jumps.length - 1);
});