const JOB_EXTRACTOR_SYSTEM_PROMPT = `<Role>
You are an text analysis expert.
</Role>

<TASK>
Analyze the provided job description text and extract the pieces of information that are about the applicant. This includes any section that starts or include We are looking, or other sections about the candidate such as Skills, Qualifications, Nice to have, ideal candidate, your role, what you bring, etc. This does not include the other information such as about us, compensation, equal opportunities, etc.
Do not add any introductory text or explanations. 
</TASK>

<Instructions>
Only return the original text from the job post.
</Instructions>`;

const RESUME_CHECKER_SYSTEM_PROMPT = `<Role>
Assume you are a professional recruiter.
</Role>

<TASK 1>
Develop a list of requirements, skills and experiences from the job description, with their relative importance from 1 to 10, 1 being not important and 10 being critical. 
</TASK 1>
<TASK 2>
Compare the resume and the job description for items in the job description that are missing in the resume.
Provide match score for the resume regarding each requirement in a table format. showing the item, weight and match score. Present this in a table format.
</TASK 2>
<TASK 3>
Provide suggestions to improve the match between resume and the job description. This should include instructions to implement the suggestion on the resume.
</TASK 3>
<TASK 4>
Provide a list of grammatical errors and suggestions to improve them.
Provide a list of items on the resume that are irrelevant to the job description, with the goal to reduce noise.
</TASK 4>
`;

const JOB_LOCATION_MATCH_SYSTEM_PROMPT = `<Role>
Assume you are a professional recruiter.
</Role>

<TASK 1>
Identify the job location from the job description. This can be a city, state, country or remote. If the job is remote, identify if there are any location restrictions such as time zone or country. 
</TASK 1>
<TASK 2>
return the location in a plain text format.
</TASK 2>
`;
// --- Context Menu Setup ---
browser.runtime.onInstalled.addListener(() => {
  // Create parent menu item for "Check my resume"
  browser.contextMenus.create({
    id: "resume-checker-context-menu",
    title: "Check my resume",
    contexts: ["page", "selection"],
  });

  // Create menu item for "Copy Job Post"
  browser.contextMenus.create({
    id: "copy-job-post-context-menu",
    title: "Copy Job Post",
    contexts: ["page", "selection"],
  });
});

// Redirect clicks on the extension icon to the options page
browser.action.onClicked.addListener(() => {
    browser.runtime.openOptionsPage();
});

// --- Main Workflow Trigger ---
browser.contextMenus.onClicked.addListener((info, tab) => {
  switch (info.menuItemId) {
    case "resume-checker-context-menu":
      startResumeCheckWorkflow(tab.id);
      break;
    case "copy-job-post-context-menu":
      copyJobPostWorkflow(tab.id);
      break;
  }
});

// --- Workflow 1: Resume Check ---
async function startResumeCheckWorkflow(tabId) {
  let popupId = null;
  let jobExtractorLLM = "meta-llama/llama-4-scout-17b-16e-instruct";
  let resumeCheckerLLM = "openai/gpt-oss-120b";
  //let resumeCheckerLLM = "deepseek-r1-distill-llama-70b"; 
  try {
    const popup = await browser.windows.create({
        url: "popup.html",
        type: "popup",
        width: 500,
        height: 800,
    });
    // The popup might take a moment to load, we need its tab ID to send messages
    const popupTab = popup.tabs[0];
    popupId = popupTab.id;

    // 1. Get user settings
    const settings = await browser.storage.local.get(["apiUrl", "apiKey", "resumeText"]);
    if (!settings.apiUrl || !settings.apiKey || !settings.resumeText) {
      throw new Error("API settings or resume are missing. Please configure them in the extension options.");
    }
    
    // 2. Inject content script to get page text
    const injectionResults = await browser.scripting.executeScript({
      target: { tabId: tabId },
      files: ["content_script.js"],
    });
    
    const pageContent = injectionResults[0].result;
    if (!pageContent || pageContent.trim() === "") {
        throw new Error("Could not extract any text content from the page.");
    }
    
    // --- Agent 1: Job Extractor ---
    const jobDataJson = await callLlmApi(
      pageContent,
      JOB_EXTRACTOR_SYSTEM_PROMPT,
      settings,
      jobExtractorLLM
    );
    console.log(`Job Data using ${jobExtractorLLM}: ${jobDataJson}`);
    let jobData = jobDataJson;
    if (!jobData) {
        throw new Error("Agent 1 returned JSON in an unexpected format. It's missing 'requirements' or 'skills'.");
    }

    // Remove anything between <think> and </think> (including tags), save them separately
    const thinkMatches = [];
    jobData = jobData.replace(/<think>[\s\S]*?<\/think>/gi, (match) => {
      thinkMatches.push(match);
      return '';
    });

    console.log("Removed <think> blocks:", thinkMatches);
    console.log("Job Data after removing <think> blocks:", jobData);

    // --- Agent 2: Resume Checker ---
    const analysisPrompt = `JOB DETAILS:\n${JSON.stringify(jobData, null, 2)}\n\nUSER RESUME:\n${settings.resumeText}`;
    const analysisResult = await callLlmApi(
      analysisPrompt,
      RESUME_CHECKER_SYSTEM_PROMPT,
      settings,
      resumeCheckerLLM
    );
    const thinkMatchesAnalysis = [];
    const analysisResultCleaned = analysisResult.replace(/<think>[\s\S]*?<\/think>/gi, (match) => {
      thinkMatchesAnalysis.push(match);
      return '';
    });

    // --- Agent 3: Location Checker ---
    //const locationPrompt = `JOB DETAILS:\n${JSON.stringify(jobData, null, 2)}`;
    const locationResult = await callLlmApi(
      pageContent,//locationPrompt,
      JOB_LOCATION_MATCH_SYSTEM_PROMPT,
      settings,
      resumeCheckerLLM
    );
    const locationThinkMatchAnalysis = [];
    const locationResultCleaned = locationResult.replace(/<think>[\s\S]*?<\/think>/gi, (match) => {
      locationThinkMatchAnalysis.push(match);
      return '';
    });




    // 5. Display Results
    browser.tabs.sendMessage(popupId, {
      type: "SUCCESS",
      data: locationResultCleaned + "\n\n##############\n\n" + analysisResultCleaned ,
    });

  } catch (error) {
    console.error("Error in resume check workflow:", error);
    if (popupId) {
      browser.tabs.sendMessage(popupId, {
        type: "ERROR",
        message: error.message,
      });
    } else {
        // If popup creation failed, alert is a fallback
        browser.tabs.executeScript(tabId, {
            code: `alert("Error: ${error.message.replace(/"/g, '\\"')}");`
        });
    }
  }
}
// --- Workflow 2: Copy Job Post (New) ---
async function copyJobPostWorkflow(tabId) {
    try {
        const settings = await browser.storage.local.get(["apiUrl", "apiKey"]);
        if (!settings.apiUrl || !settings.apiKey) {
            throw new Error("API settings are missing. Please configure them in the extension options.");
        }
        
        await showNotification(tabId, "Extracting job details...", "info", 10000);

        const injectionResults = await browser.scripting.executeScript({
            target: { tabId: tabId }, files: ["content_script.js"],
        });

        const pageContent = injectionResults[0].result;
        if (!pageContent || pageContent.trim() === "") {
            throw new Error("Could not extract any text content from the page.");
        }

        // --- Run Agent 1 Only ---
        const jobDataJson = await callLlmApi(pageContent, JOB_EXTRACTOR_SYSTEM_PROMPT, settings, "meta-llama/llama-4-scout-17b-16e-instruct");
        
        // Attempt to prettify the JSON before copying
        let clipboardText = jobDataJson;
        try {
            clipboardText = JSON.stringify(JSON.parse(jobDataJson), null, 2);
        } catch(e) {
            // If it's not valid JSON, copy the raw text from the model.
            console.warn("Model did not return valid JSON, copying raw text.");
        }

        // Copy to clipboard
        await browser.scripting.executeScript({
            target: { tabId },
            func: (text) => navigator.clipboard.writeText(text),
            args: [clipboardText],
        });

        // Show success message
        await showNotification(tabId, "Job details copied to clipboard!", "success");

    } catch (error) {
        console.error("Error in copy job post workflow:", error);
        await showNotification(tabId, `Error: ${error.message}`, 'error');
    }
}

// --- API Call Function ---
async function callLlmApi(prompt, systemPrompt, settings, agent_llm) {
  const { apiUrl, apiKey } = settings;
  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: agent_llm, // Model can be user-configurable in a future version
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`API request failed with status ${response.status}: ${errorBody}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error("API Call failed:", error);
    throw new Error(`Failed to communicate with the LLM API endpoint. Check the console for more details. Error: ${error.message}`);
  }
}
// --- On-Page Notification Helper ---
async function showNotification(tabId, message, type = 'info', duration = 3000) {
    await browser.scripting.executeScript({
        target: { tabId },
        func: (msg, type, duration) => {
            // Remove any existing notification
            const existingToast = document.getElementById('extension-toast-notification');
            if (existingToast) {
                existingToast.remove();
            }

            const toast = document.createElement('div');
            toast.id = 'extension-toast-notification';
            toast.textContent = msg;

            let backgroundColor;
            switch(type) {
                case 'success': backgroundColor = '#28a745'; break;
                case 'error': backgroundColor = '#dc3545'; break;
                default: backgroundColor = '#17a2b8'; break; // info
            }

            Object.assign(toast.style, {
                position: 'fixed',
                bottom: '20px',
                right: '20px',
                padding: '12px 20px',
                borderRadius: '5px',
                backgroundColor: backgroundColor,
                color: 'white',
                zIndex: '999999',
                fontSize: '16px',
                boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
                transition: 'opacity 0.5s ease'
            });

            document.body.appendChild(toast);

            setTimeout(() => {
                toast.style.opacity = '0';
                setTimeout(() => toast.remove(), 500); // Remove from DOM after fade out
            }, duration);
        },
        args: [message, type, duration],
    });
}