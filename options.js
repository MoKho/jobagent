function saveOptions(e) {
  e.preventDefault();
  const apiUrl = document.getElementById("api-url").value;
  const apiKey = document.getElementById("api-key").value;
  const resumeText = document.getElementById("resume-text").value;

  browser.storage.local.set({
    apiUrl: apiUrl,
    apiKey: apiKey,
    resumeText: resumeText
  }).then(() => {
    const status = document.getElementById("status");
    status.textContent = "Options saved!";
    status.classList.add("success");
    setTimeout(() => {
      status.textContent = "";
      status.classList.remove("success");
    }, 2000);
  }).catch(err => {
    const status = document.getElementById("status");
    status.textContent = `Error saving options: ${err}`;
    status.classList.add("error");
  });
}

function restoreOptions() {
  browser.storage.local.get(["apiUrl", "apiKey", "resumeText"]).then(result => {
    document.getElementById("api-url").value = result.apiUrl || 'https://api.groq.com/openai/v1/chat/completions';
    document.getElementById("api-key").value = result.apiKey || '';
    document.getElementById("resume-text").value = result.resumeText || ``;
  });
}

document.addEventListener("DOMContentLoaded", restoreOptions);
document.getElementById("options-form").addEventListener("submit", saveOptions);