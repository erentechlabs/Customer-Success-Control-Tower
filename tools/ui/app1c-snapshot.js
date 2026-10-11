
  // ---- Shared snapshot: published by the connector on a schedule (every 10 minutes on business days by default), read-only ----
  // Also renders inside OneDrive/SharePoint's sandboxed preview: no network, storage, pop-ups or navigation here.
  function liveAction() { /* a snapshot has no live connection */ }
  function attentionSave(update, notice) {
    if (MODE !== "demo") { return; }
    if (update.rules) { AT.preferences.rules = update.rules; }
    else { AT.preferences.cases[update.caseId] = update.record; }
    AT.preferences.revision++; AT.notice = notice; AT.error = "";
    render(false);
    if (drawer.classList.contains("on") && drawer.dataset.attentionCase) {
      if (drawer.dataset.view === "followup") { openFollowUp(drawer.dataset.attentionCase); }
      else { openCase(drawer.dataset.attentionCase); }
    }
  }
  // Nearest scheduled publish time before (dir -1, at or before) or after (dir 1) `now`, on Istanbul business days.
  function slotNear(slots, now, dir) {
    if (!slots.length) { return null; }
    const list = dir < 0 ? slots.slice().reverse() : slots;
    let day = csctLocalDay(now, CTX.tz);
    for (let i = 0; i < 21; i++, day += dir) {
      if (!csctIsBizDay(day, CTX)) { continue; }
      const base = day * DAY - CTX.tz * HOUR;
      for (let k = 0; k < list.length; k++) {
        const t = base + list[k];
        if (dir < 0 ? t <= now : t > now) { return t; }
      }
    }
    return null;
  }
  function bootData() {
    window.csctFindings = findings;
    const pub = Date.parse(SNAP.publishedAt || SNAP.generatedAt);
    ingest(runLive(SNAP, pub));
    const slots = D.publishSlots, now = Date.now();
    const due = slotNear(slots, now, -1), next = slotNear(slots, now, 1);
    const at = (ms) => new Date(ms).toISOString();
    const sameDay = next !== null && csctLocalDay(next, CTX.tz) === csctLocalDay(now, CTX.tz);
    $("asof").textContent = "Updated " + fmtT(D.input.asOf) + (next !== null ? DOT + "next " + (sameDay ? hhmm(at(next)) : fmtT(at(next))) : "");
    $("asof").title = "Published " + fmtT(D.input.asOf) + (SNAP.publishedBy ? " by " + SNAP.publishedBy : "") + ". This copy is updated " + scheduleText(slots) +
      " (Istanbul time)" + (next !== null ? "; the next update is due " + fmtT(at(next)) + ". Reload the page after that to see it." : ".");
    // One missed slot is normal (an update lands a minute or two after its time); warn once the copy is clearly behind.
    const gap = slotGap(slots) || HOUR;
    if (due !== null && pub < due - Math.max(gap, 20 * 60000)) {
      $("banner").innerHTML = '<div class="ib caution">' + ico("warning_filled") + '<div class="ib-tx"><b>Not updated recently</b>Last update ' + H(fmtT(D.input.asOf)) +
        ". The update due " + H(fmtT(at(due))) + " has not arrived, probably because the PC that publishes it is off; the numbers below may be out of date.</div></div>";
    } else if (next !== null) {
      // The preview never refreshes itself, so say so once a newer copy is due.
      const wait = next + 2 * 60000 - now;
      if (wait > 0 && wait < 3 * DAY) {
        setTimeout(() => {
          if ($("banner").innerHTML) { return; }
          $("banner").innerHTML = '<div class="ib">' + ico("info_filled") + '<div class="ib-tx"><b>A newer copy may be available</b>This page does not refresh by itself. It shows the copy published ' +
            H(fmtT(D.input.asOf)) + "; updates are published " + H(scheduleText(slots)) + ". Reload the page to see the latest.</div></div>";
          scroller.style.setProperty("--ph-h", ph.offsetHeight + "px");
        }, wait);
      }
    }
    render(false);
  }
