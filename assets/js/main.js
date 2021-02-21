// Code buttons.
function createCopyButton(highlightDiv) {
  const button = document.createElement("button");
  button.className = "copy-code-button";
  button.type = "button";
  button.innerHTML = feather.icons["clipboard"].toSvg();
  button.setAttribute("aria-label", "Copy Code");
  button.addEventListener("click", () =>
    copyCodeToClipboard(button, highlightDiv)
  );
  addCopyButtonToDom(button, highlightDiv);
}

async function copyCodeToClipboard(button, highlightDiv) {
  const codeToCopy = highlightDiv.querySelector(":last-child > pre > code")
    .innerText;
  try {
    result = await navigator.permissions.query({ name: "clipboard-write" });
    if (result.state == "granted" || result.state == "prompt") {
      await navigator.clipboard.writeText(codeToCopy);
    } else {
      copyCodeBlockExecCommand(codeToCopy, highlightDiv);
    }
  } catch (_) {
    copyCodeBlockExecCommand(codeToCopy, highlightDiv);
  } finally {
    codeWasCopied(button);
  }
}

function copyCodeBlockExecCommand(codeToCopy, highlightDiv) {
  const textArea = document.createElement("textArea");
  textArea.contentEditable = "true";
  textArea.readOnly = "false";
  textArea.className = "copyable-text-area";
  textArea.value = codeToCopy;
  highlightDiv.insertBefore(textArea, highlightDiv.firstChild);
  const range = document.createRange();
  range.selectNodeContents(textArea);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  textArea.setSelectionRange(0, 999999);
  document.execCommand("copy");
  highlightDiv.removeChild(textArea);
}

function codeWasCopied(button) {
  button.blur();
  button.innerHTML = feather.icons["thumbs-up"].toSvg();
  setTimeout(function () {
    button.innerHTML = feather.icons["clipboard"].toSvg();
  }, 1000);
}

function addCopyButtonToDom(button, highlightDiv) {
  highlightDiv.insertBefore(button, highlightDiv.firstChild);
  const wrapper = document.createElement("div");
  wrapper.className = "highlight-wrapper";
  highlightDiv.parentNode.insertBefore(wrapper, highlightDiv);
  wrapper.appendChild(highlightDiv);
}

document
  .querySelectorAll(".highlight")
  .forEach((highlightDiv) => createCopyButton(highlightDiv));

// Dark and light modes.
let systemInitiatedDark = window.matchMedia("(prefers-color-scheme: dark)");
let theme = localStorage.getItem("theme");

if (systemInitiatedDark.matches || theme === "dark") {
  document.getElementById("mode").innerHTML = feather.icons["sun"].toSvg();
} else {
  document.getElementById("mode").innerHTML = feather.icons["moon"].toSvg();
}

function prefersColorTest(systemInitiatedDark) {
  if (systemInitiatedDark.matches) {
    document.documentElement.setAttribute("data-theme", "dark");
    document.getElementById("mode").innerHTML = feather.icons["sun"].toSvg();
    localStorage.setItem("theme", "");
  } else {
    document.documentElement.setAttribute("data-theme", "light");
    document.getElementById("mode").innerHTML = feather.icons["moon"].toSvg();
    localStorage.setItem("theme", "");
  }
}
systemInitiatedDark.addListener(prefersColorTest);

function toggleMode() {
  let theme = localStorage.getItem("theme");
  if (theme === "dark") {
    document.documentElement.setAttribute("data-theme", "light");
    localStorage.setItem("theme", "light");
    document.getElementById("mode").innerHTML = feather.icons["moon"].toSvg();
  } else if (theme === "light") {
    document.documentElement.setAttribute("data-theme", "dark");
    localStorage.setItem("theme", "dark");
    document.getElementById("mode").innerHTML = feather.icons["sun"].toSvg();
  } else if (systemInitiatedDark.matches) {
    document.documentElement.setAttribute("data-theme", "light");
    localStorage.setItem("theme", "light");
    document.getElementById("mode").innerHTML = feather.icons["moon"].toSvg();
  } else {
    document.documentElement.setAttribute("data-theme", "dark");
    localStorage.setItem("theme", "dark");
    document.getElementById("mode").innerHTML = feather.icons["sun"].toSvg();
  }
}

WebFont.load({ custom: { families: ["Roboto Mono"] } });
feather.replace();
