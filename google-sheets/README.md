# Google Sheet sync: setup

Sleep Journal can keep your journal in **your own private Google Sheet**: one tab per year, rows
sorted by night, the same green / blue / yellow columns as the export, and edits in either place
sync both ways (the newest edit of a night wins).

The app never asks for your Google login. Instead, a small script inside your sheet accepts
updates from the app when they carry your **secret key**. The sheet itself stays private: it is
never shared, and the script can only touch that one spreadsheet.

There are two ways to get the sheet. Both end with the same three steps.

| | Time | Choose it if |
|---|---|---|
| **A. Copy the template** | about 3 minutes | you want the quick route |
| **B. Build it yourself** | about 10 minutes | you'd rather read the code before running it |

Do this on a computer.

---

## A. Copy the template

1. Open the template: **[Sleep Journal (template)](https://docs.google.com/spreadsheets/d/1l50vz3VIxr2xL9UeE2nO9G9v37i5nPfvdZRehS89KOI/copy)**
2. Click **Make a copy**. Google mentions that an Apps Script file is attached: that is the sync
   script, which you can read any time under **Extensions → Apps Script**.

The copy is your own private spreadsheet. Nobody else, including whoever made the template, can see
it or its data, and it starts without a key: you create yours in step 1 below.

Now continue with **Finish the setup**.

## B. Build it yourself

1. Create a new Google Sheet (e.g. go to `sheets.new`) and name it, e.g. **Sleep Journal**.
2. In the sheet: **Extensions → Apps Script**.
3. Delete the sample code, paste the whole of [`SleepJournalSync.gs`](SleepJournalSync.gs), and click **Save**.
4. Limit what the script may access. Google works out a script's permissions by scanning its code,
   and that guess can include more than the script uses. This replaces the guess with an exact
   list of one permission:
   1. Click the gear icon (**Project Settings**) and tick **Show "appsscript.json" manifest file in editor**.
   2. Back in the **Editor**, open **`appsscript.json`** and add the `oauthScopes` line shown below.
      Keep the other lines as they are (yours may differ slightly), and make sure the line before
      it ends with a comma:

      ```json
      {
        "timeZone": "America/Los_Angeles",
        "dependencies": {},
        "exceptionLogging": "STACKDRIVER",
        "runtimeVersion": "V8",
        "oauthScopes": ["https://www.googleapis.com/auth/spreadsheets.currentonly"]
      }
      ```
   3. Click **Save**.

Now continue with **Finish the setup**.

---

## Finish the setup

Open the script editor from your sheet: **Extensions → Apps Script**.

### 1. Create your secret key

1. In the function dropdown at the top, pick **`setup`**, then click **Run**.
2. **If you get "Access blocked: Authorization Error … The OAuth client was not found. Error 401:
   invalid_client"**, Google hasn't finished setting up the script's sign-in yet. This can happen
   on a brand-new script, especially a fresh copy of the template; nothing is wrong with your
   account or the code. (No error? Skip to the next step.)
   1. Add a blank line anywhere in the code and click **Save**.
   2. Wait a couple of minutes, reload the editor page, and run `setup` again.
   3. Still there? Open the sheet in a private browser window signed in to only one Google
      account, and run `setup` from there.
3. Google asks you to authorize the script. Because it's a personal script and not a published
   app, it shows *"Google hasn't verified this app"*: click **Advanced → Go to … (unsafe)**.
4. Check what it asks for. It should be exactly one permission: **"View and manage spreadsheets
   that this application has been installed in"**, meaning this one spreadsheet. If it lists
   anything else (for example *"Display and run third-party web content in prompts and sidebars"*
   or anything about Google Drive), click **Cancel**, do step B.4 above, and run `setup` again.

### 2. Deploy it as a web app

1. **Deploy → New deployment**, then the gear icon → **Web app**.
2. **Execute as: Me**, **Who has access: Anyone**, then **Deploy**.
   *"Anyone" means the app can reach the script without a Google login. Every request still has
   to carry your secret key, and wrong keys are refused.*
3. Copy the **Web app URL** it shows. It ends in **`/exec`**. (You can find it again under
   **Deploy → Manage deployments**.)

### 3. Connect the app

The app asks for two things, in **Settings → Google Sheet**:

| Box in the app | Where to get it |
|---|---|
| **Web app URL** | The URL you just copied (**Deploy → Manage deployments**). It looks like `https://script.google.com/macros/s/…/exec` and must end in `/exec`, not `/dev` (`/dev` is Google's test address and only works while you're logged in). |
| **Secret key** | Pick **`showConnectionCode`** in the function dropdown, click **Run**, and copy the long run of letters and numbers from the **Execution log**. |

Get them to your phone privately (a private note works; don't email or post them), paste each into
its box, and tap **Connect**. The app removes stray spaces and adds a missing `https://` for you,
and tells you which box is wrong if it can't connect.

The first sync sends your whole journal. After that the app syncs by itself a few seconds after
each change and when you open the app. To use the web app or a second phone with the same sheet,
enter the same two things there.

## Good to know

- **Keep the URL and key secret.** Anyone who has both can read and change your journal sheet.
  Don't commit them, post them or email them. If they ever leak, run **`rotateSecret`** and paste
  the new key into the app; the old one stops working.
- **Open sheet**: once connected, **Settings → Google Sheet → Open sheet** opens the spreadsheet
  (in the Google Sheets app or your browser). You still need to be signed in to your Google
  account to see it; the button only saves you finding the file.
- **Editing in Sheets is fine.** Changing a cell marks that row as updated (the *Updated* column),
  and the app picks it up on its next sync. Typing a new row with a *Night of* date also works.
- **Your own columns are kept.** Add columns to the right; they move with their row.
- **Deleting doesn't sync.** Deleting a night on the phone or a row in the sheet doesn't remove it
  from the other side. Rows are never deleted by the script.
- **Backups**: Google Sheets keeps every earlier version of the spreadsheet by itself:
  **File → Version history → See version history** lets you look at or restore any of them. The
  script makes no copies of its own (that would need access to your whole Google Drive). For a copy
  outside Google, use the app's CSV export.
- **Compact routine columns**: each routine shows as one column like `●●○● 3/4` (hover the header
  to see which dot is which). The per-item columns, and any field you switch off in the app's
  Export panel, are hidden rather than removed: right-click the column letters → *Unhide* to see them.
  Hand-edit the per-item columns, not the summary: the summary is recalculated by the app.
- **Your routine list syncs too.** The script keeps it in a **Routine items** tab (name, check-in,
  order, hidden), so the phone and the web app show the same checklist in the same order. Change
  items in the app (**Routines → Edit**); leave the *Id* column alone.
- **Renaming a routine item** renames its column in the year tabs, so its history stays in one
  column. (If an older version already split an item into two columns, the next rename folds the
  old column into the new one and removes the old one.)

## Updating the script

A sheet's script doesn't update by itself, whether you copied the template or pasted the code.
When the script changes, the app shows a note in **Settings → Google Sheet** saying your sheet's
script is an older version. Your nights keep syncing (newer features, like the shared routine
list in version 3, wait until you update); to update:

1. In the script editor, replace all the code with the current
   [`SleepJournalSync.gs`](SleepJournalSync.gs) and click **Save**.
2. **Deploy → Manage deployments → ✏️ → Version: New version → Deploy.**

Your Web app URL and secret key stay the same, so there is nothing to change in the app.

- **Granted more than one permission in the past?** (Older versions asked for Google Drive access
  for backup copies.) After updating, do step B.4, then take the old access back: open
  https://myaccount.google.com/permissions, remove this script's access, and run `setup` again to
  approve the single permission.
- **If a sync fails with a permission error after step B.4**, the script needs something outside
  that one permission. Remove the `oauthScopes` line to go back to Google's own list, and please
  report it.

## For maintainers: publishing the template

The template is an ordinary Google Sheet with the script inside, shared read-only with a link
that ends in `/copy`.

1. Create a new Google Sheet named **Sleep Journal (template)**. Consider which Google account you
   use: people opening the link can see the owner's name.
2. **Extensions → Apps Script**: paste [`SleepJournalSync.gs`](SleepJournalSync.gs), then do step
   B.4 (the `oauthScopes` line). Save.
3. **Don't** run `setup` and **don't** deploy in the template. (If you do, nothing leaks: a key
   only works in the spreadsheet it was made in, so every copy has to create its own.)
4. Leave the sheet itself empty. **Share → General access → Anyone with the link → Viewer.**
5. Take the sheet's address, `https://docs.google.com/spreadsheets/d/<id>/edit…`, and replace
   everything after `<id>/` with `copy`:
   `https://docs.google.com/spreadsheets/d/<id>/copy`
6. Put that link in route A above and in `SHEET_TEMPLATE_URL` in
   [`app/src/lib/links.ts`](../app/src/lib/links.ts).

When the script changes: paste the new code into the template (new copies get it), bump
`SCRIPT_VERSION` in the script and `LATEST_SCRIPT_VERSION` in `app/src/db/sync.ts` together, and
existing users see the "older version" note.
