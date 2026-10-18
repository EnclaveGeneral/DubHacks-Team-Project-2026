import { getAlerts, getClock } from "~lib/api"

// Clicking the toolbar icon opens the side panel.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error)

// MV3 alarms can't fire more often than every 30 s. The side panel polls
// faster on its own while it is open.
chrome.alarms.create("poll-alerts", { periodInMinutes: 0.5 })

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "poll-alerts") return
  try {
    const { day } = await getClock()
    const alerts = await getAlerts(day)
    await chrome.action.setBadgeText({ text: alerts.length ? String(alerts.length) : "" })
    await chrome.action.setBadgeBackgroundColor({ color: "#c2410c" })
  } catch {
    await chrome.action.setBadgeText({ text: "" })
  }
})

// Content scripts ask the background to open the side panel (user gesture
// from the "Protect this purchase" toggle).
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === "open-side-panel" && sender.tab?.windowId !== undefined) {
    chrome.sidePanel.open({ windowId: sender.tab.windowId }).catch(console.error)
  }
})
