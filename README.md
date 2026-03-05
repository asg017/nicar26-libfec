# NICAR26: Introducing libfec, a faster FEC filing parser

This repo contains the code and tipsheet for the [*"Introducing libfec, a faster FEC filing parser"*](https://schedules.ire.org/nicar-2025/index.html#1175) class at [NICAR26](https://www.ire.org/training/conferences/nicar-2026/), happening on Thursday March 5th 2026 from 11:30am-12:30pm. 

`libfec` and other campaign finance resources:

- The [`libfec` project on Github](https://github.com/asg017/libfec)
- The [`libfec` Discussions page](https://github.com/asg017/libfec/discussions), share bug reports and ask for help here!
- The [Introducing `libfec`](https://alexgarcia.xyz/blog/2025/introducing-libfec/index.html) blog post (October 2025), the  announcement of the first version of `libfec`
- Ask for more general campaign finance help at the `#campfin` channel in [NewsNerdery Slack](https://newsnerdery.org/)
- The [NICAR26 `libfec` Slides](https://docs.google.com/presentation/d/1FhecSJiLQOgUJqguiSVtNKGsJfLrrZrvoNmmO4G2BDQ/edit?usp=sharing) (mostly a hands-on demo tho)

## NICAR26 `libfec` Manual

To make it easier to explain how data inputed in FEC forms end up in raw filings data, I made a small PDF document when a few example documents!

You can access them here:

- [NICAR26 `libfec` manual](./nicar26-libfec-manual.pdf)
- [NICAR26 `libfec` manual (Printable version)](./nicar26-libfec-manual-printable.pdf)

The printable version can be printed double sided (flip on short edge) and stapled in the middle for a cute booklet/magazine vibe:

![](https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:fjqvlcfakpht4exffejyfc25/bafkreifjgx2uxukvqsdhuyeybcio6wtzkt6copbc4w76e4rre3ta4456vq@jpeg)


## `libfec` tips


### Get an API Key!

Sign up for an [OPEN FEC API Key](https://api.open.fec.gov/developers/), and give it to `libfec` with the `LIBFEC_API_KEY` environment variable:

```bash
export LIBFEC_API_KEY="API_KEY_HERE"
libfec export C00919084 -o sample.db
```

`libfec` will use the API key when resolving filings for committees or candidiates. By default it will use `DEMO_KEY`, which only gives you a few requests per IP-address before it fails. Get an API key!


### when it doubt, `libfec info`

If you have a ID for a filing, committee, or candidate, use `libfec info` to get a quick overview of who/what that ID points to!

```bash
libfec info C00918268
libfec info H2CA39078
```

### For Agentic workflows, give them access to `libfec --help` (dangerous!)

If you wanna try giving AI access to campaign finance records, I recommend CLI-based agentic tools like [Claude Code](https://code.claude.com/docs/en/overview), [Gemini CLI](https://docs.cloud.google.com/gemini/docs/codeassist/gemini-cli), or [Codex](https://chatgpt.com/codex).

I've found OK results by just telling them something like:

```
use sqlite3, `libfec export --help`, `libfec search --help` to get me data for all house elections happening in Indiana
```

[Here's a Claude Code transcript](https://gisthost.github.io/?bccd8d407f498122948803fd6f5dc39c/page-001.html) of when I did that, with the following output:


```
The data is exported to /Users/alex/tmp/indiana-house.db. Here's a summary:

All 9 Indiana House Districts — 2026 Cycle (181 filings, 54 candidates)
District 	Incumbent 	Party 	Challengers
IN-01 	Frank Mrvan 	DEM 	4 (1 DEM, 3 REP)
IN-02 	Rudy Yakym III 	REP 	3 (3 DEM)
IN-03 	(open) 	— 	2 (1 REP, 1 DEM)
IN-04 	James Baird 	REP 	8 (5 DEM, 2 REP)
IN-05 	Victoria Spartz 	REP 	6 (6 DEM)
IN-06 	Jefferson Shreve 	REP 	7 (6 DEM, 1 REP)
IN-07 	Andre Carson 	DEM 	3 (2 DEM, 1 REP)
IN-08 	Mark Messmer 	REP 	3 (2 DEM, 1 REP)
IN-09 	Erin Houchin 	REP 	7 (6 DEM, 1 IND)

The database includes: 
- libfec_candidates — candidate info (party, district, incumbent status) 
- libfec_committees — committee details 
- libfec_F3 — financial summaries (receipts, disbursements, cash on hand) 
- libfec_schedule_a — itemized contributions 
- libfec_schedule_b — itemized disbursements 
- libfec_filings — filing metadata

You can query it with sqlite3 /Users/alex/tmp/indiana-house.db. For example, to see top fundraisers:
....
```

Do I trust this? Not really! But looking at the logs, it ended up running:

```
libfec export IN01 IN02 IN03 IN04 IN05 IN06 IN07 IN08 IN09 --cycle 2026 -o /Users/alex/tmp/indiana-house.db --write-metadata --include-all-bulk
```

Which is kindof right, it could've also done:

```
libfec export --state IN --office H --cycle 2026 -o sample.db
```

But it happened to "know" there's only 9 districts in IN.

Do I trust the analyis it's done? Kindof! Not really! idk man but it's a great first pass

Some campaign finance things I **would NOT trust AI for** as of now:

- "Knowing" different PACs by name or affiliation (ex "find me all the crypto related PACs" or "Show me the congressmembers b")
- 