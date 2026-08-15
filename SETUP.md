# Job Radar setup

Six steps, about fifteen minutes. Everything that could be automated already is.
What is left needs your Google account or your GitHub account in a browser, which
a cloud scheduled run cannot reach.

Do them in order. Steps 1 and 2 get the site live. Steps 3 to 5 turn on cross
device syncing. Step 6 points the scheduled task at the new repo.

---

## 1. Create the repo and push

The repo must be public if you want free GitHub Pages hosting. That is fine here:
the repo holds public job links only. Your applied and dismissed state lives in
your private Google Sheet, never in git.

```bash
gh repo create jobradar --public --source=. --push
```

Or without the gh CLI: create an empty public repo named `jobradar` on github.com,
then from this folder run

```bash
git remote add origin https://github.com/YOUR_USERNAME/jobradar.git
git branch -M main
git push -u origin main
```

## 2. Turn on GitHub Pages

Repo → Settings → Pages → Source: **Deploy from a branch** → Branch: **main**,
folder **/ (root)** → Save.

Give it a minute, then open `https://YOUR_USERNAME.github.io/jobradar/`.

You should see the dashboard with a yellow **Local only mode** banner. That banner
is expected until step 5. Bookmark this URL on your phone and your laptop.

## 3. Create the tracker sheet

Go to sheets.new and name it something like **Job Radar tracker**. Leave it empty.
The script creates the tab and headers on first write.

Keep this sheet private. Do not share it.

## 4. Deploy the Apps Script

1. In that sheet: **Extensions → Apps Script**.
2. Delete the placeholder `myFunction` code.
3. Paste the whole contents of `appsscript/Code.gs` from this repo.
4. On line 14, replace `CHANGE_ME_TO_A_LONG_RANDOM_STRING` with a long random
   string. Generate one with `openssl rand -hex 24`. Keep it somewhere safe,
   you need it again in step 5.
5. Save.
6. **Deploy → New deployment** → gear icon → **Web app**.
   - Description: anything
   - Execute as: **Me**
   - Who has access: **Anyone**
7. Click Deploy, authorize when prompted. Google will warn that the app is
   unverified because you wrote it yourself. Choose Advanced, then Go to project.
8. Copy the **Web app URL**. It ends in `/exec`.

"Who has access: Anyone" is required because your browser calls this endpoint
without a Google login. The shared secret is what keeps other people out, which
is why it needs to be long and random.

## 5. Wire the site to the sheet

Open `index.html`, find the CONFIG block near the top of the script, and fill in
both values:

```js
var CONFIG = {
  endpoint: "https://script.google.com/macros/s/AKfy.../exec",
  secret: "the same long random string from step 4"
};
```

Commit and push. Wait a minute for Pages to rebuild, then reload the site.

The yellow banner should be gone and the pill in the top right should read
**Synced** in green. Click Mark as applied on any role and check that a row
appears in your sheet.

### About the secret being in a public repo

Anyone reading your public repo can see this secret and therefore write to your
tracker sheet. The realistic risk is low, since nobody is looking, and the worst
case is junk rows in a spreadsheet you can clear. If that still bothers you, the
clean fix is to make the repo private and pay for GitHub Pro, which allows Pages
on private repos. Do not put anything sensitive in the sheet either way.

## 6. Repoint the scheduled task

Once the site is live, the scheduled run needs to write `data.json` to this repo
instead of building an HTML file. That prompt rewrite is the last piece and it is
not applied yet, on purpose. Say the word and it gets updated.

---

# How it works

```
scheduled run (cloud)  ->  git push data.json  ->  GitHub Pages  ->  your browser
                                                                          |
                                          your clicks ->  Apps Script  ->  Sheet
```

The scheduled run only ever writes `data.json`. It never touches `index.html`,
which is why the per run token cost drops to roughly one or two thousand tokens.

Your clicks never pass through Claude at all. The browser talks straight to Apps
Script, which writes to the sheet. That path costs zero tokens no matter how many
times you use it.

## Behaviour when things break

The site degrades honestly rather than pretending to work.

| Situation | What you see |
| --- | --- |
| No endpoint configured | Yellow banner, pill reads Local only, marks saved in browser |
| Endpoint unreachable | Red pill reading Sync failed with a pending count, red banner, SAVING badge on the affected card, change kept locally and retried on next load |
| Wrong secret | Red pill, banner showing the bad secret error |
| Sheet reachable again | Queue flushes automatically, pill returns to Synced |
| localStorage cleared | State is pulled back from the sheet on next load |

A queued write is never dropped silently. This was verified with a mock endpoint
covering healthy, failing, and wrong secret cases.

## Local development

```bash
python3 -m http.server 8899
```

Then open `http://127.0.0.1:8899/index.html`. Opening the file directly with a
`file://` path will not work, because browsers block `fetch` of `data.json` from
disk. The site tells you this if it happens.

Tests, which need Node and Playwright:

```bash
node tests/test.js     # rendering, counts, localStorage, needs the server running
node tests/mock.js &   # fake Apps Script on port 8898
node tests/test2.js    # sync, failure, recovery, bad secret
```
