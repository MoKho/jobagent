const resultContainer = document.getElementById("result-container");

/**
 * A simple converter for the specific Markdown format expected from the LLM.
 * This avoids needing a full Markdown library for this specific use case.
 * @param {string} markdownText The markdown text from the API.
 * @returns {string} HTML formatted string.
 */
// function markdownToHtml(markdownText) {
//   return markdownText
//     .replace(/## (.*)/g, '<h2>$1</h2>') // ## Headers
//     .replace(/\* (.*)/g, '<li>$1</li>')  // * List items
//     .replace(/(\<\/li\>)\n(<li>)/g, '$1$2') // Join consecutive list items
//     .replace(/(<li>.*<\/li>)/g, '<ul>$1</ul>') // Wrap lists in <ul>
//     .replace(/<\/ul>\n<ul>/g, '') // Merge adjacent <ul> tags
//     .replace(/\n/g, '<br>'); // Newlines to <br>
// }

browser.runtime.onMessage.addListener((message) => {
  if (message.type === "SUCCESS") {
    const htmlContent = marked.parse(message.data); // Use marked for Markdown
    resultContainer.innerHTML = htmlContent;
  } else if (message.type === "ERROR") {
    resultContainer.innerHTML = `<div class="error-message">${message.message}</div>`;
  }
});