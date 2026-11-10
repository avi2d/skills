# Eval sweeps

`bun run docs` writes this page from the sweep records beside it, and `bun run test` fails when the two disagree.

Each record is one `bun run eval`, written by the sweep when it ends.
It holds the model, the thinking level, the repeats and the commit the sweep ran on.
It holds a sha256 of each Rule and reachable Reference file, and whether any differed from that commit.
It holds every run's verdict, spend and turns, and whether the run wrote a test.
No record is edited once committed, so a new measurement is a new record.
A Rule's pooled row treats every run as independent, so read the case rows beneath it.
New sweep records store input, output, cache-read, and cache-write token totals.
Older records show missing cache counts as not recorded.
Where cache counts are not recorded, the input column leaves out cached prompt tokens, so it undercounts the prompt.
A run with no reported cost uses the matching Anthropic model rates from pi's catalog when available.
The page marks that cost as estimated.
A zero cost without a matching rate appears as not measured.

## Sweeps

| Sweep | Model | Thinking | Repeats | Runs | Input tokens | Output tokens | Cache-read tokens | Cache-write tokens | Cost | Commit | Prose |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [2026-09-24T11:13:59Z](2026-09-24T11-13-59Z.json) | `opencode-go/muse-spark-1.3-contributor` | high | 3 | 24 of 24 | 143033 | 67598 | not recorded | not recorded | $0.0288 | `4b1bae1` | not recorded |
| [2026-09-25T11:11:38Z](2026-09-25T11-11-38Z.json) | `opencode-go/muse-spark-1.3-contributor` | high | 5 | 20 of 20 | 74010 | 18204 | not recorded | not recorded | $0.0116 | `3e1fe4d` | as committed |
| [2026-09-25T11:21:28Z](2026-09-25T11-21-28Z.json) | `opencode-go/muse-spark-1.3-contributor` | high | 5 | 40 of 40 | 281810 | 144977 | not recorded | not recorded | $0.0594 | `369ded9` | as committed |
| [2026-09-25T11:33:23Z](2026-09-25T11-33-23Z.json) | `opencode-go/muse-spark-1.3-contributor` | high | 5 | 20 of 20 | 423869 | 132972 | not recorded | not recorded | $0.0757 | `1cd66a4` | as committed |
| [2026-09-25T11:50:43Z](2026-09-25T11-50-43Z.json) | `opencode-go/muse-spark-1.3-contributor` | high | 5 | 20 of 20 | 89393 | 26311 | not recorded | not recorded | $0.0150 | `0d316b7` | as committed |
| [2026-09-25T11:53:21Z](2026-09-25T11-53-21Z.json) | `opencode-go/muse-spark-1.3-contributor` | high | 5 | 20 of 20 | 175134 | 93141 | not recorded | not recorded | $0.0384 | `80c5a61` | as committed |
| [2026-09-25T12:02:27Z](2026-09-25T12-02-27Z.json) | `opencode-go/muse-spark-1.3-contributor` | high | 5 | 30 of 30 | 177087 | 62335 | not recorded | not recorded | $0.0320 | `9c2d225` | as committed |
| [2026-09-25T12:08:00Z](2026-09-25T12-08-00Z.json) | `opencode-go/muse-spark-1.3-contributor` | high | 5 | 20 of 20 | 198358 | 9047 | not recorded | not recorded | $0.0223 | `8544817` | as committed |
| [2026-09-25T12:09:01Z](2026-09-25T12-09-01Z.json) | `opencode-go/muse-spark-1.3-contributor` | high | 5 | 20 of 20 | 79448 | 20291 | not recorded | not recorded | $0.0124 | `88988a7` | as committed |
| [2026-09-25T12:10:59Z](2026-09-25T12-10-59Z.json) | `opencode-go/muse-spark-1.3-contributor` | high | 5 | 20 of 20 | 182482 | 104257 | not recorded | not recorded | $0.0410 | `3c9c393` | as committed |
| [2026-09-25T12:23:29Z](2026-09-25T12-23-29Z.json) | `opencode-go/muse-spark-1.3-contributor` | high | 5 | 20 of 20 | 78970 | 18232 | not recorded | not recorded | $0.0121 | `e21a46d` | as committed |
| [2026-09-25T15:25:58Z](2026-09-25T15-25-58Z-c83e101b-53b5-4d06-b70b-80c68e2c3f26.json) | `opencode-go/muse-spark-1.3-contributor` | high | 5 | 10 of 10 | 102807 | 25154 | not recorded | not recorded | $0.0161 | `fe490af` | as committed |
| [2026-09-25T15:43:06Z](2026-09-25T15-43-06Z-40d0007f-d00a-4dad-81d4-c202e7d4bca8.json) | `opencode-go/muse-spark-1.3-contributor` | high | 5 | 10 of 10 | 74248 | 16690 | not recorded | not recorded | $0.0110 | `9c5f431` | as committed |
| [2026-09-25T15:44:39Z](2026-09-25T15-44-39Z-dd0cc91f-1593-445c-bc17-dfc4d9438a26.json) | `opencode-go/muse-spark-1.3-contributor` | high | 5 | 10 of 10 | 51307 | 12021 | not recorded | not recorded | $0.0078 | `a91c340` | as committed |
| [2026-09-25T15:45:54Z](2026-09-25T15-45-54Z-bca74ad7-9688-4e6f-b746-bb734897da36.json) | `opencode-go/muse-spark-1.3-contributor` | high | 5 | 10 of 10 | 53209 | 10633 | not recorded | not recorded | $0.0077 | `45db30c` | as committed |
| [2026-09-25T15:47:02Z](2026-09-25T15-47-02Z-356bc030-6e1a-453b-a4f1-3f3dc8b4361f.json) | `openai-codex/gpt-6-luna` | xhigh | 5 | 20 of 20 | 144778 | 10895 | not recorded | not recorded | $0.0214 | `69695df` | as committed |
| [2026-09-25T15:50:13Z](2026-09-25T15-50-13Z-14c394e2-9ab5-4a07-9cbf-9c04871f32ea.json) | `openai-codex/gpt-6-luna` | xhigh | 5 | 40 of 40 | 346012 | 78275 | not recorded | not recorded | $0.0786 | `97fe1fb` | as committed |
| [2026-09-25T16:03:00Z](2026-09-25T16-03-00Z-1b3e24fe-2216-4f13-ac84-9f5772d3ee8c.json) | `openai-codex/gpt-6-luna` | xhigh | 5 | 20 of 20 | 431455 | 64597 | not recorded | not recorded | $0.0924 | `075c04e` | as committed |
| [2026-09-25T16:16:45Z](2026-09-25T16-16-45Z-9d82b2da-ddb9-45a7-843f-21c7f6725c2b.json) | `openai-codex/gpt-6-luna` | xhigh | 5 | 20 of 20 | 170303 | 18557 | not recorded | not recorded | $0.0278 | `ad5b094` | as committed |
| [2026-09-25T16:21:07Z](2026-09-25T16-21-07Z-aad67ea3-dfc9-42eb-8448-dd60ae1fa943.json) | `openai-codex/gpt-6-luna` | xhigh | 5 | 20 of 20 | 310830 | 96739 | not recorded | not recorded | $0.0922 | `6b2ca0e` | as committed |
| [2026-09-25T16:38:59Z](2026-09-25T16-38-59Z-5e7c5370-9e9c-4f90-a61a-8d59f4a7f285.json) | `openai-codex/gpt-6-luna` | xhigh | 5 | 30 of 30 | 258535 | 37957 | not recorded | not recorded | $0.0483 | `081bafa` | as committed |
| [2026-09-25T16:46:31Z](2026-09-25T16-46-31Z-c11b42e9-6fc9-4f5a-9a47-6f006dc5c8e0.json) | `openai-codex/gpt-6-luna` | xhigh | 5 | 20 of 20 | 94597 | 1887 | not recorded | not recorded | $0.0106 | `ba657ce` | as committed |
| [2026-09-25T16:47:44Z](2026-09-25T16-47-44Z-aadbf9d5-9edd-4afc-b7b0-9c44953ea779.json) | `openai-codex/gpt-6-luna` | xhigh | 5 | 20 of 20 | 126317 | 9891 | not recorded | not recorded | $0.0179 | `db397b9` | as committed |
| [2026-09-25T16:50:31Z](2026-09-25T16-50-31Z-b086bc71-2f5d-4c27-823f-06ee2b2c8799.json) | `openai-codex/gpt-6-luna` | xhigh | 5 | 10 of 10 | 151442 | 13639 | not recorded | not recorded | $0.0258 | `7fc465a` | as committed |
| [2026-09-25T16:53:23Z](2026-09-25T16-53-23Z-faff4a67-92b2-4ca1-959e-1d33d42c28ac.json) | `openai-codex/gpt-6-luna` | xhigh | 5 | 10 of 10 | 93114 | 8775 | not recorded | not recorded | $0.0147 | `079c400` | as committed |
| [2026-09-25T16:55:14Z](2026-09-25T16-55-14Z-61692362-fb7a-4ef6-8886-acf63ab71b5a.json) | `openai-codex/gpt-6-luna` | xhigh | 5 | 10 of 10 | 58117 | 4420 | not recorded | not recorded | $0.0084 | `7100432` | as committed |
| [2026-09-25T16:56:28Z](2026-09-25T16-56-28Z-c7d8501f-f0c8-4ec3-b590-8554cdaea850.json) | `openai-codex/gpt-6-luna` | xhigh | 5 | 10 of 10 | 67445 | 4721 | not recorded | not recorded | $0.0096 | `ec5f88e` | as committed |
| [2026-09-25T16:57:56Z](2026-09-25T16-57-56Z-da03c1e1-57dc-4fa7-9071-6387291d9bba.json) | `openai-codex/gpt-6-luna` | xhigh | 5 | 20 of 20 | 189248 | 46334 | not recorded | not recorded | $0.0449 | `4fbad27` | as committed |
| [2026-09-25T17:05:14Z](2026-09-25T17-05-14Z-4dc8f7bc-cb8c-4d6c-a4ca-ab2462b96663.json) | `openai-codex/gpt-6-sol` | high | 5 | 20 of 20 | 103719 | 9331 | not recorded | not recorded | $0.3384 | `8bb22af` | as committed |
| [2026-09-25T17:08:17Z](2026-09-25T17-08-17Z-733a8d21-bdd1-4ee8-928b-f3d01dd544df.json) | `openai-codex/gpt-6-sol` | high | 5 | 40 of 40 | 316748 | 64244 | not recorded | not recorded | $1.3832 | `8b02c4e` | as committed |
| [2026-09-25T17:19:55Z](2026-09-25T17-19-55Z-8aff9a1c-109b-4b6f-b63c-4945d22e342e.json) | `openai-codex/gpt-6-sol` | high | 5 | 20 of 20 | 283008 | 34916 | not recorded | not recorded | $1.1165 | `edb7ba7` | as committed |
| [2026-09-25T17:27:52Z](2026-09-25T17-27-52Z-5638700a-73ee-45d6-9ffc-6e8e8264fbda.json) | `openai-codex/gpt-6-sol` | high | 5 | 20 of 20 | 100371 | 15735 | not recorded | not recorded | $0.3992 | `f744f57` | as committed |
| [2026-09-25T17:31:54Z](2026-09-25T17-31-54Z-2d29ece2-ea57-4f6d-a35a-41e6582807d4.json) | `openai-codex/gpt-6-sol` | high | 5 | 20 of 20 | 192431 | 57190 | not recorded | not recorded | $1.1166 | `02fdeb5` | as committed |
| [2026-09-25T17:42:16Z](2026-09-25T17-42-16Z-ca6aadb2-9e42-4e8b-8df9-18a53b8fc0ce.json) | `openai-codex/gpt-6-sol` | high | 5 | 30 of 30 | 201538 | 34986 | not recorded | not recorded | $0.8363 | `575358a` | as committed |
| [2026-09-25T17:49:46Z](2026-09-25T17-49-46Z-bd8acb98-736f-4a81-a37c-0c7c5978f397.json) | `openai-codex/gpt-6-sol` | high | 5 | 20 of 20 | 60072 | 2651 | not recorded | not recorded | $0.1570 | `6fa30b4` | as committed |
| [2026-09-25T17:51:20Z](2026-09-25T17-51-20Z-3cf7ee4b-a3c6-41a5-a6bc-87593a0d4685.json) | `openai-codex/gpt-6-sol` | high | 5 | 20 of 20 | 91465 | 15756 | not recorded | not recorded | $0.3663 | `1950b2b` | as committed |
| [2026-09-25T17:54:56Z](2026-09-25T17-54-56Z-1f24cf16-1949-4a91-87a3-abb00ca5318d.json) | `openai-codex/gpt-6-sol` | high | 5 | 10 of 10 | 127764 | 7916 | not recorded | not recorded | $0.3903 | `ab97f43` | as committed |
| [2026-09-25T17:57:13Z](2026-09-25T17-57-13Z-d7b5408b-2f59-4104-8d89-8086227ed972.json) | `openai-codex/gpt-6-sol` | high | 5 | 10 of 10 | 49137 | 3167 | not recorded | not recorded | $0.1407 | `33e84e7` | as committed |
| [2026-09-25T17:58:26Z](2026-09-25T17-58-26Z-9c03cfcf-eb4f-4ada-aa02-3106b11da2e8.json) | `openai-codex/gpt-6-sol` | high | 5 | 10 of 10 | 46531 | 4577 | not recorded | not recorded | $0.1496 | `33b493c` | as committed |
| [2026-09-25T17:59:47Z](2026-09-25T17-59-47Z-6dfd3a80-528f-4ec7-9d03-e11bcfe2bc1d.json) | `openai-codex/gpt-6-sol` | high | 5 | 10 of 10 | 69922 | 5208 | not recorded | not recorded | $0.2111 | `163c418` | as committed |
| [2026-09-25T18:01:31Z](2026-09-25T18-01-31Z-d0fd04b1-7cce-4cb5-a54b-8b371a6a6568.json) | `openai-codex/gpt-6-sol` | high | 5 | 20 of 20 | 134080 | 35716 | not recorded | not recorded | $0.6737 | `a67eca7` | as committed |
| [2026-09-25T18:07:59Z](2026-09-25T18-07-59Z-e48a2532-9eb6-4d97-aa40-c9f0406d4a5c.json) | `claude-bridge/claude-opus-5-5` | xhigh | 5 | 20 of 20 | 226 | 30070 | not recorded | not recorded | not measured | `e336ead` | as committed |
| [2026-09-25T18:10:37Z](2026-09-25T18-10-37Z-29218180-514b-4ac0-a201-62b89c1b7591.json) | `claude-bridge/claude-opus-5-5` | xhigh | 5 | 40 of 40 | 452 | 198431 | not recorded | not recorded | not measured | `ed52101` | as committed |
| [2026-09-25T18:22:45Z](2026-09-25T18-22-45Z-6671528c-2f6c-4b8b-ad7e-c48c884d19ed.json) | `claude-bridge/claude-opus-5-5` | xhigh | 5 | 20 of 20 | 474 | 122186 | not recorded | not recorded | not measured | `eb9166c` | as committed |
| [2026-09-25T18:31:56Z](2026-09-25T18-31-56Z-996b1276-f2ff-4b3e-92cc-c41365e62e39.json) | `claude-bridge/claude-opus-5-5` | xhigh | 5 | 20 of 20 | 208 | 35823 | not recorded | not recorded | not measured | `d459bc7` | as committed |
| [2026-09-25T18:34:40Z](2026-09-25T18-34-40Z-35de01a9-98c0-476f-b9e7-82fbad403e7b.json) | `claude-bridge/claude-opus-5-5` | xhigh | 5 | 20 of 20 | 320 | 144306 | not recorded | not recorded | not measured | `b51f4ce` | as committed |
| [2026-09-25T18:44:11Z](2026-09-25T18-44-11Z-656bb656-adc1-42c4-8c83-8dae521fad00.json) | `claude-bridge/claude-opus-5-5` | xhigh | 5 | 30 of 30 | 360 | 61430 | not recorded | not recorded | not measured | `5e953d0` | as committed |
| [2026-09-25T18:48:33Z](2026-09-25T18-48-33Z-0f5d5c8d-61a6-4cc4-8bf7-e7866855f894.json) | `claude-bridge/claude-opus-5-5` | xhigh | 5 | 20 of 20 | 106 | 6812 | not recorded | not recorded | not measured | `50a8397` | as committed |
| [2026-09-25T18:49:44Z](2026-09-25T18-49-44Z-65ba236f-d8c4-42c4-8830-4246355f4371.json) | `claude-bridge/claude-opus-5-5` | xhigh | 5 | 20 of 20 | 186 | 19019 | not recorded | not recorded | not measured | `ccbdc7d` | as committed |
| [2026-09-25T18:51:44Z](2026-09-25T18-51-44Z-c96629cb-351a-4439-9064-71b05b6a54b9.json) | `claude-bridge/claude-opus-5-5` | xhigh | 5 | 10 of 10 | 152 | 58482 | not recorded | not recorded | not measured | `583e19b` | as committed |
| [2026-09-25T18:56:01Z](2026-09-25T18-56-01Z-7b175944-edb1-41da-8bc9-cb97251527fa.json) | `claude-bridge/claude-opus-5-5` | xhigh | 5 | 10 of 10 | 96 | 15749 | not recorded | not recorded | not measured | `7403030` | as committed |
| [2026-09-25T18:57:30Z](2026-09-25T18-57-30Z-832f43a7-d84e-4f9c-85c5-6c34332cd7a9.json) | `claude-bridge/claude-opus-5-5` | xhigh | 5 | 10 of 10 | 100 | 14060 | not recorded | not recorded | not measured | `d2c6b22` | as committed |
| [2026-09-25T18:58:51Z](2026-09-25T18-58-51Z-24c287b2-e1d2-4280-93d7-5a6f24f57164.json) | `claude-bridge/claude-opus-5-5` | xhigh | 5 | 10 of 10 | 104 | 15042 | not recorded | not recorded | not measured | `59e3f2f` | as committed |
| [2026-09-25T19:00:10Z](2026-09-25T19-00-10Z-3c5c7a6c-6484-4900-9cda-dd0f5083a028.json) | `claude-bridge/claude-opus-5-5` | xhigh | 5 | 20 of 20 | 254 | 94301 | not recorded | not recorded | not measured | `7625e15` | as committed |
| [2026-09-28T13:51:31Z](2026-09-28T13-51-31Z-736329ea-0b34-4310-92ab-af00bef8dfa9.json) | `claude-bridge/claude-opus-5-5` | xhigh | 10 | 20 of 20 | 268 | 62454 | 610162 | 97877 | estimated $1.8616 | `a20926c` | as committed |
| [2026-09-28T14:15:09Z](2026-09-28T14-15-09Z-18e59220-57af-431d-b852-446a1ec5ce2f.json) | `claude-bridge/claude-opus-5-5` | xhigh | 10 | 20 of 20 | 286 | 71237 | 700738 | 107221 | estimated $2.1021 | `9e90f4e` | as committed |
| [2026-09-28T14:29:52Z](2026-09-28T14-29-52Z-736cd5d6-a588-4ff3-b698-2044ce17c5da.json) | `claude-bridge/claude-opus-5-5` | xhigh | 10 | 20 of 20 | 266 | 64406 | 619924 | 95555 | estimated $1.8909 | `9e90f4e` | as committed |
| [2026-10-10T07:22:27Z](2026-10-10T07-22-27Z-3fcdb440-91eb-47c8-89b7-7206ea459935.json) | `claude-bridge/claude-opus-5-5` | high | 5 | 40 of 40 | 312 | 72240 | 640091 | 96848 | estimated $2.0583 | `510ebb8` | as committed |
| [2026-10-10T07:27:43Z](2026-10-10T07-27-43Z-fbf57548-8090-456c-8d54-bbc700c31f66.json) | `claude-bridge/claude-opus-5-5` | high | 5 | 40 of 40 | 350 | 46572 | 725016 | 71810 | estimated $1.4369 | `510ebb8` | as committed |
| [2026-10-10T07:28:15Z](2026-10-10T07-28-15Z-129e1140-0efd-442e-be08-934a4387b9c3.json) | `opencode-go/muse-spark-1.3-contributor` | high | 10 | 40 of 40 | 603110 | 596296 | 9076038 | 0 | $0.1977 | `f9980fd` | as committed |
| [2026-10-10T07:30:58Z](2026-10-10T07-30-58Z-88d8e800-eac9-4167-8b71-dd4378515b90.json) | `claude-bridge/claude-opus-5-5` | high | 5 | 40 of 40 | 338 | 62667 | 680013 | 90449 | estimated $1.8429 | `510ebb8` | as committed |
| [2026-10-10T07:33:58Z](2026-10-10T07-33-58Z-bed1e15a-8204-4d84-877f-793a4e69614d.json) | `claude-bridge/claude-opus-5-5` | high | 10 | 40 of 40 | 730 | 293957 | 2878585 | 393052 | estimated $8.4230 | `f9980fd` | as committed |
| [2026-10-10T07:35:09Z](2026-10-10T07-35-09Z-c2ecb1a7-9797-40c8-90e6-15f584773daa.json) | `claude-bridge/claude-opus-5-5` | high | 5 | 40 of 40 | 340 | 63659 | 667703 | 92181 | estimated $1.8690 | `510ebb8` | as committed |
| [2026-10-10T07:39:21Z](2026-10-10T07-39-21Z-76e3965b-df2c-46f5-abee-fedadabd9cd9.json) | `claude-bridge/claude-opus-5-5` | high | 5 | 40 of 40 | 608 | 119729 | 2706121 | 292670 | estimated $4.4016 | `510ebb8` | as committed |
| [2026-10-10T07:52:39Z](2026-10-10T07-52-39Z-f90b96e5-21ba-4a32-977f-abbb4c31890f.json) | `claude-bridge/claude-opus-5-5` | high | 5 | 40 of 40 | 338 | 55067 | 760861 | 122059 | estimated $1.8652 | `510ebb8` | as committed |
| [2026-10-10T07:53:01Z](2026-10-10T07-53-01Z-69f41016-a030-402d-8826-e8725de4e0d1.json) | `claude-bridge/claude-opus-5-5` | high | 10 | 40 of 40 | 760 | 303140 | 3132677 | 404476 | estimated $8.7148 | `f9980fd` | as committed |
| [2026-10-10T07:56:28Z](2026-10-10T07-56-28Z-b3650e82-d085-4d90-8c7f-168932204bcf.json) | `claude-bridge/claude-opus-5-5` | high | 5 | 40 of 40 | 312 | 38316 | 741075 | 78809 | estimated $1.3098 | `510ebb8` | as committed |
| [2026-10-10T08:00:13Z](2026-10-10T08-00-13Z-59067a9d-94d3-4cd9-81ed-3dce4879b810.json) | `opencode-go/muse-spark-1.3-contributor` | high | 10 | 40 of 40 | 645018 | 607313 | 9515271 | 0 | $0.2050 | `f9980fd` | as committed |
| [2026-10-10T12:05:51Z](2026-10-10T12-05-51Z-6b294489-9c52-4206-8426-d6c45c168b85.json) | `opencode-go/muse-spark-1.3-contributor` | high | 20 | 40 of 40 | 460690 | 673067 | 5783638 | 0 | $0.1922 | `4709e4d` | as committed |
| [2026-10-10T13:25:08Z](2026-10-10T13-25-08Z-9e7b2392-103b-4cff-974f-271f8982e150.json) | `opencode-go/muse-spark-1.3-contributor` | high | 20 | 40 of 40 | 2819691 | 3391151 | 107511436 | 0 | $1.1752 | `4709e4d` | as committed |
| [2026-10-10T15:55:44Z](2026-10-10T15-55-44Z-1e3baee5-b1ac-4522-8755-a75aa204f1f1.json) | `opencode-go/muse-spark-1.3-contributor` | high | 20 | 40 of 40 | 2610768 | 2995564 | 96264512 | 0 | $1.0527 | `4709e4d` | as committed |
| [2026-10-10T18:18:01Z](2026-10-10T18-18-01Z-85dba70c-2ea1-4323-b1a0-a5541a90668b.json) | `claude-bridge/claude-opus-5-5` | high | 2 | 8 of 8 | 206 | 201909 | 2071082 | 240709 | estimated $5.6568 | `4709e4d` | as committed |
| [2026-10-10T18:45:59Z](2026-10-10T18-45-59Z-f5f02f05-3833-4083-bab2-da7ec3456b15.json) | `opencode-go/muse-spark-1.3-contributor` | high | 20 | 40 of 40 | 3211252 | 3372876 | 105780972 | 0 | $1.2073 | `4709e4d` | as committed |
| [2026-10-10T21:09:12Z](2026-10-10T21-09-12Z-db62aab3-995e-4075-b834-1f1662e9ac6b.json) | `opencode-go/muse-spark-1.3-contributor` | high | 20 | 40 of 40 | 3202913 | 3415871 | 103398989 | 0 | $1.2103 | `4709e4d` | as committed |
| [2026-10-10T23:33:39Z](2026-10-10T23-33-39Z-07245a14-c990-4fd0-b780-cd18b0e3dbff.json) | `opencode-go/muse-spark-1.3-contributor` | high | 20 | 40 of 40 | 2862494 | 3183327 | 98745423 | 0 | $1.1204 | `4709e4d` | as committed |
| [2026-10-11T11:45:16Z](2026-10-11T11-45-16Z-3028d8b2-94b0-43e5-add5-4ce22d22e3de.json) | `claude-bridge/claude-opus-5-5` | high | 2 | 24 of 24 | 222 | 34165 | 462684 | 80503 | estimated $1.1792 | `14f323e` | as committed |
| [2026-10-11T11:52:12Z](2026-10-11T11-52-12Z-34ed3a56-ad49-48e8-a1bf-01922c727513.json) | `opencode-go/muse-spark-1.3-contributor` | high | 5 | 40 of 40 | 186670 | 65986 | 587078 | 0 | $0.0330 | `14f323e` | as committed |
| [2026-10-11T11:57:01Z](2026-10-11T11-57-01Z-3d3edd4f-5ffd-4b1f-b968-b01eabb53e7d.json) | `claude-bridge/claude-opus-5-5` | high | 2 | 16 of 16 | 140 | 24524 | 339286 | 68451 | estimated $0.9012 | `14f323e` | as committed |
| [2026-10-11T12:02:00Z](2026-10-11T12-02-00Z-b8976dee-397f-4622-bac3-b8ff673ba52e.json) | `opencode-go/muse-spark-1.3-contributor` | high | 5 | 40 of 40 | 168481 | 138959 | 677340 | 0 | $0.0460 | `6919b74` | as committed |
| [2026-10-11T12:23:05Z](2026-10-11T12-23-05Z-aa66eea2-5792-4249-afff-c11f1584de75.json) | `opencode-go/muse-spark-1.3-contributor` | high | 5 | 40 of 40 | 578465 | 218893 | 4921183 | 0 | $0.1115 | `3d96c44` | as committed |
| [2026-10-11T12:36:18Z](2026-10-11T12-36-18Z-51fb6132-0629-4bce-8e8c-8fa763a692c9.json) | `claude-bridge/claude-opus-5-5` | high | 2 | 16 of 16 | 222 | 45388 | 959012 | 129285 | estimated $1.7469 | `3d96c44` | as committed |
| [2026-10-11T14:20:54Z](2026-10-11T14-20-54Z-5812370d-bd9e-4b49-82bb-0da5ceb79f99.json) | `opencode-go/muse-spark-1.3-contributor` | high | 5 | 40 of 40 | 344142 | 160382 | 1357123 | 0 | $0.0692 | `b601b88` | as committed |
| [2026-10-11T14:42:27Z](2026-10-11T14-42-27Z-64b2fcc4-3a2f-4eaf-8187-be5750997ba2.json) | `opencode-go/muse-spark-1.3-contributor` | high | 5 | 40 of 40 | 408604 | 227802 | 1803738 | 0 | $0.0900 | `b601b88` | as committed |
| [2026-10-11T15:05:48Z](2026-10-11T15-05-48Z-9d89b3c2-e3ac-4cae-9188-c6274941e78a.json) | `claude-bridge/claude-opus-5-5` | high | 2 | 32 of 32 | 308 | 80005 | 898801 | 255863 | estimated $3.0604 | `b601b88` | as committed |
| [2026-10-11T17:00:03Z](2026-10-11T17-00-03Z-06e42c20-9f55-4ba3-85b7-5a4c06ef950a.json) | `claude-bridge/claude-opus-5-5` | high | 2 | 16 of 16 | 134 | 23437 | 248711 | 44153 | estimated $0.7398 | `71a6627` | as committed |
| [2026-10-11T18:28:10Z](2026-10-11T18-28-10Z-2c4c59fd-701a-4f83-b79e-e780616bccac.json) | `opencode-go/muse-spark-1.3-contributor` | high | 5 | 40 of 40 | 224841 | 149146 | 888383 | 0 | $0.0541 | `aba12a0` | as committed |
| [2026-10-11T18:37:49Z](2026-10-11T18-37-49Z-204f9490-3727-47aa-aa7a-9d701c656842.json) | `claude-bridge/claude-opus-5-5` | high | 2 | 16 of 16 | 132 | 23678 | 228800 | 39738 | estimated $0.7185 | `aba12a0` | as committed |
| [2026-10-11T19:32:43Z](2026-10-11T19-32-43Z-fb88aa39-663a-45a9-b7aa-65fed67d05af.json) | `opencode-go/muse-spark-1.3-contributor` | high | 5 | 80 of 80 | 948675 | 541074 | 3983454 | 0 | $0.2110 | `c964b22` | as committed |
| [2026-10-11T20:09:36Z](2026-10-11T20-09-36Z-470a2003-7ffd-4232-9905-9d62575127a7.json) | `claude-bridge/claude-opus-5-5` | high | 2 | 32 of 32 | 314 | 92030 | 1214406 | 381754 | estimated $3.9935 | `c964b22` | as committed |
| [2026-10-12T14:14:27Z](2026-10-12T14-14-27Z-7cfb5e78-f0b8-4f29-b857-4b5030210031.json) | `opencode-go/muse-spark-1.3-contributor` | high | 5 | 120 of 120 | 1546574 | 883877 | 7812219 | 0 | $0.3471 | `b133b41` | as committed |
| [2026-10-12T16:21:59Z](2026-10-12T16-21-59Z-7bcaf5ef-6348-4f05-9585-23409b7d8e8d.json) | `claude-bridge/claude-opus-5-5` | high | 2 | 48 of 48 | 528 | 155336 | 2223569 | 603056 | estimated $6.5688 | `b133b41` | as committed |

## agent-docs

| Sweep | Model | Thinking | Case | Injected | Withheld | Difference | Fisher p |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [2026-09-25T15:43:06Z](2026-09-25T15-43-06Z-40d0007f-d00a-4dad-81d4-c202e7d4bca8.json) | `opencode-go/muse-spark-1.3-contributor` | high | all | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| | | | release-pointer | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| [2026-09-25T16:53:23Z](2026-09-25T16-53-23Z-faff4a67-92b2-4ca1-959e-1d33d42c28ac.json) | `openai-codex/gpt-6-luna` | xhigh | all | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| | | | release-pointer | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| [2026-09-25T17:57:13Z](2026-09-25T17-57-13Z-d7b5408b-2f59-4104-8d89-8086227ed972.json) | `openai-codex/gpt-6-sol` | high | all | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| | | | release-pointer | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| [2026-09-25T18:56:01Z](2026-09-25T18-56-01Z-7b175944-edb1-41da-8bc9-cb97251527fa.json) | `claude-bridge/claude-opus-5-5` | xhigh | all | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| | | | release-pointer | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |

## change-messages

| Sweep | Model | Thinking | Case | Injected | Withheld | Difference | Fisher p |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [2026-10-11T14:42:27Z](2026-10-11T14-42-27Z-64b2fcc4-3a2f-4eaf-8187-be5750997ba2.json) | `opencode-go/muse-spark-1.3-contributor` | high | all | 20/20, 100% | 14/20, 70% | +30 pp | 0.020 |
| | | | en-pr | 5/5, 100% | 2/5, 40% | +60 pp | 0.167 |
| | | | ru-pr | 5/5, 100% | 2/5, 40% | +60 pp | 0.167 |
| | | | en-errors | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| | | | ru-errors | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| [2026-10-11T15:05:48Z](2026-10-11T15-05-48Z-9d89b3c2-e3ac-4cae-9188-c6274941e78a.json) | `claude-bridge/claude-opus-5-5` | high | all | 8/8, 100% | 5/8, 63% | +38 pp | 0.200 |
| | | | en-pr | 2/2, 100% | 1/2, 50% | +50 pp | 1.000 |
| | | | ru-pr | 2/2, 100% | 0/2, 0% | +100 pp | 0.333 |
| | | | en-errors | 2/2, 100% | 2/2, 100% | +0 pp | 1.000 |
| | | | ru-errors | 2/2, 100% | 2/2, 100% | +0 pp | 1.000 |

## comment-discipline

| Sweep | Model | Thinking | Case | Injected | Withheld | Difference | Fisher p |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [2026-09-24T11:13:59Z](2026-09-24T11-13-59Z.json) | `opencode-go/muse-spark-1.3-contributor` | high | all | 12/12, 100% | 3/12, 25% | +75 pp | 3.4e-4 |
| | | | public-helper | 3/3, 100% | 0/3, 0% | +100 pp | 0.100 |
| | | | decision-record | 3/3, 100% | 0/3, 0% | +100 pp | 0.100 |
| | | | ticket-fix | 3/3, 100% | 3/3, 100% | +0 pp | 1.000 |
| | | | module-rationale | 3/3, 100% | 0/3, 0% | +100 pp | 0.100 |
| [2026-09-25T11:21:28Z](2026-09-25T11-21-28Z.json) | `opencode-go/muse-spark-1.3-contributor` | high | all | 20/20, 100% | 0/20, 0% | +100 pp | 1.5e-11 |
| | | | public-helper | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| | | | decision-record | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| | | | upstream-workaround | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| | | | module-rationale | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| [2026-09-25T15:50:13Z](2026-09-25T15-50-13Z-14c394e2-9ab5-4a07-9cbf-9c04871f32ea.json) | `openai-codex/gpt-6-luna` | xhigh | all | 20/20, 100% | 0/20, 0% | +100 pp | 1.5e-11 |
| | | | public-helper | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| | | | decision-record | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| | | | upstream-workaround | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| | | | module-rationale | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| [2026-09-25T17:08:17Z](2026-09-25T17-08-17Z-733a8d21-bdd1-4ee8-928b-f3d01dd544df.json) | `openai-codex/gpt-6-sol` | high | all | 20/20, 100% | 0/20, 0% | +100 pp | 1.5e-11 |
| | | | public-helper | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| | | | decision-record | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| | | | upstream-workaround | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| | | | module-rationale | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| [2026-09-25T18:10:37Z](2026-09-25T18-10-37Z-29218180-514b-4ac0-a201-62b89c1b7591.json) | `claude-bridge/claude-opus-5-5` | xhigh | all | 20/20, 100% | 0/20, 0% | +100 pp | 1.5e-11 |
| | | | public-helper | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| | | | decision-record | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| | | | upstream-workaround | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| | | | module-rationale | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |

## effect-error-channel

| Sweep | Model | Thinking | Case | Injected | Withheld | Difference | Fisher p |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [2026-09-25T11:33:23Z](2026-09-25T11-33-23Z.json) | `opencode-go/muse-spark-1.3-contributor` | high | all | 10/10, 100% | 9/10, 90% | +10 pp | 1.000 |
| | | | scheduled-job | 5/5, 100% | 4/5, 80% | +20 pp | 1.000 |
| | | | invoice-route | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| [2026-09-25T16:03:00Z](2026-09-25T16-03-00Z-1b3e24fe-2216-4f13-ac84-9f5772d3ee8c.json) | `openai-codex/gpt-6-luna` | xhigh | all | 10/10, 100% | 9/10, 90% | +10 pp | 1.000 |
| | | | scheduled-job | 5/5, 100% | 4/5, 80% | +20 pp | 1.000 |
| | | | invoice-route | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| [2026-09-25T17:19:55Z](2026-09-25T17-19-55Z-8aff9a1c-109b-4b6f-b63c-4945d22e342e.json) | `openai-codex/gpt-6-sol` | high | all | 10/10, 100% | 10/10, 100% | +0 pp | 1.000 |
| | | | scheduled-job | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| | | | invoice-route | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| [2026-09-25T18:22:45Z](2026-09-25T18-22-45Z-6671528c-2f6c-4b8b-ad7e-c48c884d19ed.json) | `claude-bridge/claude-opus-5-5` | xhigh | all | 10/10, 100% | 10/10, 100% | +0 pp | 1.000 |
| | | | scheduled-job | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| | | | invoice-route | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |

## fix-what-you-see

| Sweep | Model | Thinking | Case | Injected | Withheld | Difference | Fisher p |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [2026-09-25T11:50:43Z](2026-09-25T11-50-43Z.json) | `opencode-go/muse-spark-1.3-contributor` | high | all | 10/10, 100% | 0/10, 0% | +100 pp | 1.1e-5 |
| | | | unrelated-failure | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| | | | stale-readme | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| [2026-09-25T16:16:45Z](2026-09-25T16-16-45Z-9d82b2da-ddb9-45a7-843f-21c7f6725c2b.json) | `openai-codex/gpt-6-luna` | xhigh | all | 10/10, 100% | 0/10, 0% | +100 pp | 1.1e-5 |
| | | | unrelated-failure | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| | | | stale-readme | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| [2026-09-25T17:27:52Z](2026-09-25T17-27-52Z-5638700a-73ee-45d6-9ffc-6e8e8264fbda.json) | `openai-codex/gpt-6-sol` | high | all | 10/10, 100% | 5/10, 50% | +50 pp | 0.033 |
| | | | unrelated-failure | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| | | | stale-readme | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| [2026-09-25T18:31:56Z](2026-09-25T18-31-56Z-996b1276-f2ff-4b3e-92cc-c41365e62e39.json) | `claude-bridge/claude-opus-5-5` | xhigh | all | 10/10, 100% | 0/10, 0% | +100 pp | 1.1e-5 |
| | | | unrelated-failure | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| | | | stale-readme | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |

## force-determinism

| Sweep | Model | Thinking | Case | Injected | Withheld | Difference | Fisher p |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [2026-09-25T11:53:21Z](2026-09-25T11-53-21Z.json) | `opencode-go/muse-spark-1.3-contributor` | high | all | 9/9, 100%, 1 unjudged | 10/10, 100% | +0 pp | 1.000 |
| | | | convention-as-check | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| | | | watched-red | 4/4, 100%, 1 unjudged | 5/5, 100% | +0 pp | 1.000 |
| [2026-09-25T16:21:07Z](2026-09-25T16-21-07Z-aad67ea3-dfc9-42eb-8448-dd60ae1fa943.json) | `openai-codex/gpt-6-luna` | xhigh | all | 10/10, 100% | 5/10, 50% | +50 pp | 0.033 |
| | | | convention-as-check | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| | | | watched-red | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| [2026-09-25T17:31:54Z](2026-09-25T17-31-54Z-2d29ece2-ea57-4f6d-a35a-41e6582807d4.json) | `openai-codex/gpt-6-sol` | high | all | 7/10, 70% | 5/10, 50% | +20 pp | 0.650 |
| | | | convention-as-check | 2/5, 40% | 5/5, 100% | -60 pp | 0.167 |
| | | | watched-red | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| [2026-09-25T18:34:40Z](2026-09-25T18-34-40Z-35de01a9-98c0-476f-b9e7-82fbad403e7b.json) | `claude-bridge/claude-opus-5-5` | xhigh | all | 8/8, 100%, 2 unjudged | 5/7, 71%, 3 unjudged | +29 pp | 0.200 |
| | | | convention-as-check | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| | | | watched-red | 3/3, 100%, 2 unjudged | 0/2, 0%, 3 unjudged | +100 pp | 0.100 |
| [2026-09-28T13:51:31Z](2026-09-28T13-51-31Z-736329ea-0b34-4310-92ab-af00bef8dfa9.json) | `claude-bridge/claude-opus-5-5` | xhigh | all | 8/8, 100%, 2 unjudged | 0/2, 0%, 8 unjudged | +100 pp | 0.022 |
| | | | watched-red | 8/8, 100%, 2 unjudged | 0/2, 0%, 8 unjudged | +100 pp | 0.022 |
| [2026-09-28T14:15:09Z](2026-09-28T14-15-09Z-18e59220-57af-431d-b852-446a1ec5ce2f.json) | `claude-bridge/claude-opus-5-5` | xhigh | all | 9/9, 100%, 1 unjudged | 3/5, 60%, 5 unjudged | +40 pp | 0.110 |
| | | | watched-red | 9/9, 100%, 1 unjudged | 3/5, 60%, 5 unjudged | +40 pp | 0.110 |
| [2026-09-28T14:29:52Z](2026-09-28T14-29-52Z-736cd5d6-a588-4ff3-b698-2044ce17c5da.json) | `claude-bridge/claude-opus-5-5` | xhigh | all | 10/10, 100% | 8/10, 80% | +20 pp | 0.474 |
| | | | watched-red | 10/10, 100% | 8/10, 80% | +20 pp | 0.474 |

## git-hygiene

| Sweep | Model | Thinking | Case | Injected | Withheld | Difference | Fisher p |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [2026-09-25T12:02:27Z](2026-09-25T12-02-27Z.json) | `opencode-go/muse-spark-1.3-contributor` | high | all | 15/15, 100% | 15/15, 100% | +0 pp | 1.000 |
| | | | co-author | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| | | | changelog | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| | | | generated-routes | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| [2026-09-25T16:38:59Z](2026-09-25T16-38-59Z-5e7c5370-9e9c-4f90-a61a-8d59f4a7f285.json) | `openai-codex/gpt-6-luna` | xhigh | all | 15/15, 100% | 10/15, 67% | +33 pp | 0.042 |
| | | | co-author | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| | | | changelog | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| | | | generated-routes | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| [2026-09-25T17:42:16Z](2026-09-25T17-42-16Z-ca6aadb2-9e42-4e8b-8df9-18a53b8fc0ce.json) | `openai-codex/gpt-6-sol` | high | all | 15/15, 100% | 10/15, 67% | +33 pp | 0.042 |
| | | | co-author | 5/5, 100% | 3/5, 60% | +40 pp | 0.444 |
| | | | changelog | 5/5, 100% | 2/5, 40% | +60 pp | 0.167 |
| | | | generated-routes | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| [2026-09-25T18:44:11Z](2026-09-25T18-44-11Z-656bb656-adc1-42c4-8c83-8dae521fad00.json) | `claude-bridge/claude-opus-5-5` | xhigh | all | 15/15, 100% | 10/15, 67% | +33 pp | 0.042 |
| | | | co-author | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| | | | changelog | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| | | | generated-routes | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |

## guard-the-context-window

| Sweep | Model | Thinking | Case | Injected | Withheld | Difference | Fisher p |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [2026-09-25T12:08:00Z](2026-09-25T12-08-00Z.json) | `opencode-go/muse-spark-1.3-contributor` | high | all | 10/10, 100% | 4/10, 40% | +60 pp | 0.011 |
| | | | build-log | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| | | | lockfile | 5/5, 100% | 4/5, 80% | +20 pp | 1.000 |
| [2026-09-25T16:46:31Z](2026-09-25T16-46-31Z-c11b42e9-6fc9-4f5a-9a47-6f006dc5c8e0.json) | `openai-codex/gpt-6-luna` | xhigh | all | 10/10, 100% | 9/10, 90% | +10 pp | 1.000 |
| | | | build-log | 5/5, 100% | 4/5, 80% | +20 pp | 1.000 |
| | | | lockfile | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| [2026-09-25T17:49:46Z](2026-09-25T17-49-46Z-bd8acb98-736f-4a81-a37c-0c7c5978f397.json) | `openai-codex/gpt-6-sol` | high | all | 10/10, 100% | 10/10, 100% | +0 pp | 1.000 |
| | | | build-log | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| | | | lockfile | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| [2026-09-25T18:48:33Z](2026-09-25T18-48-33Z-0f5d5c8d-61a6-4cc4-8bf7-e7866855f894.json) | `claude-bridge/claude-opus-5-5` | xhigh | all | 10/10, 100% | 10/10, 100% | +0 pp | 1.000 |
| | | | build-log | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| | | | lockfile | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |

## plain-sentences

| Sweep | Model | Thinking | Case | Injected | Withheld | Difference | Fisher p |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [2026-10-10T07:22:27Z](2026-10-10T07-22-27Z-3fcdb440-91eb-47c8-89b7-7206ea459935.json) | `claude-bridge/claude-opus-5-5` | high | all | 18/20, 90% | 7/20, 35% | +55 pp | 7.7e-4 |
| | | | en-pr | 3/5, 60% | 0/5, 0% | +60 pp | 0.167 |
| | | | en-site | 5/5, 100% | 2/5, 40% | +60 pp | 0.167 |
| | | | ru-pr | 5/5, 100% | 2/5, 40% | +60 pp | 0.167 |
| | | | ru-site | 5/5, 100% | 3/5, 60% | +40 pp | 0.444 |

## plain-words

| Sweep | Model | Thinking | Case | Injected | Withheld | Difference | Fisher p |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [2026-10-10T07:27:43Z](2026-10-10T07-27-43Z-fbf57548-8090-456c-8d54-bbc700c31f66.json) | `claude-bridge/claude-opus-5-5` | high | all | 20/20, 100% | 16/20, 80% | +20 pp | 0.106 |
| | | | en-readme | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| | | | en-pr | 5/5, 100% | 1/5, 20% | +80 pp | 0.048 |
| | | | en-site | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| | | | en-errors | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |

## prove-it-works

| Sweep | Model | Thinking | Case | Injected | Withheld | Difference | Fisher p |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [2026-09-25T11:11:38Z](2026-09-25T11-11-38Z.json) | `opencode-go/muse-spark-1.3-contributor` | high | all | 5/10, 50% | 0/10, 0% | +50 pp | 0.033 |
| | | | verify-the-fix | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| | | | reproduce-first | 0/5, 0% | 0/5, 0% | +0 pp | 1.000 |
| [2026-09-25T12:23:29Z](2026-09-25T12-23-29Z.json) | `opencode-go/muse-spark-1.3-contributor` | high | all | 10/10, 100% | 0/10, 0% | +100 pp | 1.1e-5 |
| | | | verify-the-fix | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| | | | reproduce-first | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| [2026-09-25T15:47:02Z](2026-09-25T15-47-02Z-356bc030-6e1a-453b-a4f1-3f3dc8b4361f.json) | `openai-codex/gpt-6-luna` | xhigh | all | 9/10, 90% | 1/10, 10% | +80 pp | 0.001 |
| | | | verify-the-fix | 4/5, 80% | 1/5, 20% | +60 pp | 0.206 |
| | | | reproduce-first | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| [2026-09-25T17:05:14Z](2026-09-25T17-05-14Z-4dc8f7bc-cb8c-4d6c-a4ca-ab2462b96663.json) | `openai-codex/gpt-6-sol` | high | all | 9/10, 90% | 0/10, 0% | +90 pp | 1.2e-4 |
| | | | verify-the-fix | 4/5, 80% | 0/5, 0% | +80 pp | 0.048 |
| | | | reproduce-first | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| [2026-09-25T18:07:59Z](2026-09-25T18-07-59Z-e48a2532-9eb6-4d97-aa40-c9f0406d4a5c.json) | `claude-bridge/claude-opus-5-5` | xhigh | all | 10/10, 100% | 5/10, 50% | +50 pp | 0.033 |
| | | | verify-the-fix | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| | | | reproduce-first | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| [2026-10-10T07:28:15Z](2026-10-10T07-28-15Z-129e1140-0efd-442e-be08-934a4387b9c3.json) | `opencode-go/muse-spark-1.3-contributor` | high | all | 20/20, 100% | 20/20, 100% | +0 pp | 1.000 |
| | | | npm-caret | 10/10, 100% | 10/10, 100% | +0 pp | 1.000 |
| | | | exact-cents | 10/10, 100% | 10/10, 100% | +0 pp | 1.000 |
| [2026-10-10T07:33:58Z](2026-10-10T07-33-58Z-bed1e15a-8204-4d84-877f-793a4e69614d.json) | `claude-bridge/claude-opus-5-5` | high | all | 20/20, 100% | 20/20, 100% | +0 pp | 1.000 |
| | | | npm-caret | 10/10, 100% | 10/10, 100% | +0 pp | 1.000 |
| | | | exact-cents | 10/10, 100% | 10/10, 100% | +0 pp | 1.000 |
| [2026-10-10T12:05:51Z](2026-10-10T12-05-51Z-6b294489-9c52-4206-8426-d6c45c168b85.json) | `opencode-go/muse-spark-1.3-contributor` | high | all | 16/20, 80% | 18/20, 90% | -10 pp | 0.661 |
| | | | cron-next | 16/20, 80% | 18/20, 90% | -10 pp | 0.661 |
| [2026-10-10T13:25:08Z](2026-10-10T13-25-08Z-9e7b2392-103b-4cff-974f-271f8982e150.json) | `opencode-go/muse-spark-1.3-contributor` | high | all | 15/20, 75% | 8/18, 44%, 2 unjudged | +31 pp | 0.096 |
| | | | git-ignored | 15/20, 75% | 8/18, 44%, 2 unjudged | +31 pp | 0.096 |
| [2026-10-10T15:55:44Z](2026-10-10T15-55-44Z-1e3baee5-b1ac-4522-8755-a75aa204f1f1.json) | `opencode-go/muse-spark-1.3-contributor` | high | all | 12/19, 63%, 1 unjudged | 9/17, 53%, 3 unjudged | +10 pp | 0.736 |
| | | | git-ignored | 12/19, 63%, 1 unjudged | 9/17, 53%, 3 unjudged | +10 pp | 0.736 |
| [2026-10-10T18:18:01Z](2026-10-10T18-18-01Z-85dba70c-2ea1-4323-b1a0-a5541a90668b.json) | `claude-bridge/claude-opus-5-5` | high | all | 3/3, 100%, 1 unjudged | 4/4, 100% | +0 pp | 1.000 |
| | | | git-ignored | 2/2, 100% | 2/2, 100% | +0 pp | 1.000 |
| | | | cron-next | 1/1, 100%, 1 unjudged | 2/2, 100% | +0 pp | 1.000 |
| [2026-10-10T18:45:59Z](2026-10-10T18-45-59Z-f5f02f05-3833-4083-bab2-da7ec3456b15.json) | `opencode-go/muse-spark-1.3-contributor` | high | all | 13/17, 76%, 3 unjudged | 10/17, 59%, 3 unjudged | +18 pp | 0.465 |
| | | | git-ignored | 13/17, 76%, 3 unjudged | 10/17, 59%, 3 unjudged | +18 pp | 0.465 |
| [2026-10-10T21:09:12Z](2026-10-10T21-09-12Z-db62aab3-995e-4075-b834-1f1662e9ac6b.json) | `opencode-go/muse-spark-1.3-contributor` | high | all | 12/19, 63%, 1 unjudged | 5/17, 29%, 3 unjudged | +34 pp | 0.054 |
| | | | git-ignored | 12/19, 63%, 1 unjudged | 5/17, 29%, 3 unjudged | +34 pp | 0.054 |
| [2026-10-10T23:33:39Z](2026-10-10T23-33-39Z-07245a14-c990-4fd0-b780-cd18b0e3dbff.json) | `opencode-go/muse-spark-1.3-contributor` | high | all | 11/19, 58%, 1 unjudged | 12/18, 67%, 2 unjudged | -9 pp | 0.737 |
| | | | git-ignored | 11/19, 58%, 1 unjudged | 12/18, 67%, 2 unjudged | -9 pp | 0.737 |

## prove-it-works-test-first

| Sweep | Model | Thinking | Case | Injected | Withheld | Difference | Fisher p |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [2026-10-10T07:53:01Z](2026-10-10T07-53-01Z-69f41016-a030-402d-8826-e8725de4e0d1.json) | `claude-bridge/claude-opus-5-5` | high | all | 20/20, 100% | 20/20, 100% | +0 pp | 1.000 |
| | | | npm-caret | 10/10, 100% | 10/10, 100% | +0 pp | 1.000 |
| | | | exact-cents | 10/10, 100% | 10/10, 100% | +0 pp | 1.000 |
| [2026-10-10T08:00:13Z](2026-10-10T08-00-13Z-59067a9d-94d3-4cd9-81ed-3dce4879b810.json) | `opencode-go/muse-spark-1.3-contributor` | high | all | 19/19, 100%, 1 unjudged | 20/20, 100% | +0 pp | 1.000 |
| | | | npm-caret | 9/9, 100%, 1 unjudged | 10/10, 100% | +0 pp | 1.000 |
| | | | exact-cents | 10/10, 100% | 10/10, 100% | +0 pp | 1.000 |

## punctuation

| Sweep | Model | Thinking | Case | Injected | Withheld | Difference | Fisher p |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [2026-10-10T07:30:58Z](2026-10-10T07-30-58Z-88d8e800-eac9-4167-8b71-dd4378515b90.json) | `claude-bridge/claude-opus-5-5` | high | all | 20/20, 100% | 4/20, 20% | +80 pp | 1.5e-7 |
| | | | en-pr | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| | | | en-site | 5/5, 100% | 2/5, 40% | +60 pp | 0.167 |
| | | | ru-pr | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| | | | ru-errors | 5/5, 100% | 2/5, 40% | +60 pp | 0.167 |

## right-size-the-work

| Sweep | Model | Thinking | Case | Injected | Withheld | Difference | Fisher p |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [2026-09-25T12:09:01Z](2026-09-25T12-09-01Z.json) | `opencode-go/muse-spark-1.3-contributor` | high | all | 10/10, 100% | 10/10, 100% | +0 pp | 1.000 |
| | | | csv-migration | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| | | | fixture-rename | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| [2026-09-25T16:47:44Z](2026-09-25T16-47-44Z-aadbf9d5-9edd-4afc-b7b0-9c44953ea779.json) | `openai-codex/gpt-6-luna` | xhigh | all | 10/10, 100% | 10/10, 100% | +0 pp | 1.000 |
| | | | csv-migration | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| | | | fixture-rename | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| [2026-09-25T17:51:20Z](2026-09-25T17-51-20Z-3cf7ee4b-a3c6-41a5-a6bc-87593a0d4685.json) | `openai-codex/gpt-6-sol` | high | all | 10/10, 100% | 10/10, 100% | +0 pp | 1.000 |
| | | | csv-migration | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| | | | fixture-rename | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| [2026-09-25T18:49:44Z](2026-09-25T18-49-44Z-65ba236f-d8c4-42c4-8830-4246355f4371.json) | `claude-bridge/claude-opus-5-5` | xhigh | all | 10/10, 100% | 10/10, 100% | +0 pp | 1.000 |
| | | | csv-migration | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| | | | fixture-rename | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |

## russian-prose

| Sweep | Model | Thinking | Case | Injected | Withheld | Difference | Fisher p |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [2026-10-10T07:35:09Z](2026-10-10T07-35-09Z-c2ecb1a7-9797-40c8-90e6-15f584773daa.json) | `claude-bridge/claude-opus-5-5` | high | all | 20/20, 100% | 20/20, 100% | +0 pp | 1.000 |
| | | | ru-readme | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| | | | ru-pr | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| | | | ru-site | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| | | | ru-docs | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| [2026-10-11T12:02:00Z](2026-10-11T12-02-00Z-b8976dee-397f-4622-bac3-b8ff673ba52e.json) | `opencode-go/muse-spark-1.3-contributor` | high | all | 17/17, 100%, 3 unjudged | 15/20, 75% | +25 pp | 0.050 |
| | | | ru-readme | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| | | | ru-pr | 4/4, 100%, 1 unjudged | 0/5, 0% | +100 pp | 0.008 |
| | | | ru-site | 3/3, 100%, 2 unjudged | 5/5, 100% | +0 pp | 1.000 |
| | | | ru-docs | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| [2026-10-11T17:00:03Z](2026-10-11T17-00-03Z-06e42c20-9f55-4ba3-85b7-5a4c06ef950a.json) | `claude-bridge/claude-opus-5-5` | high | all | 8/8, 100% | 6/8, 75% | +25 pp | 0.467 |
| | | | ru-readme | 2/2, 100% | 2/2, 100% | +0 pp | 1.000 |
| | | | ru-pr | 2/2, 100% | 0/2, 0% | +100 pp | 0.333 |
| | | | ru-site | 2/2, 100% | 2/2, 100% | +0 pp | 1.000 |
| | | | ru-docs | 2/2, 100% | 2/2, 100% | +0 pp | 1.000 |
| [2026-10-11T18:28:10Z](2026-10-11T18-28-10Z-2c4c59fd-701a-4f83-b79e-e780616bccac.json) | `opencode-go/muse-spark-1.3-contributor` | high | all | 18/18, 100%, 2 unjudged | 15/20, 75% | +25 pp | 0.048 |
| | | | ru-readme | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| | | | ru-pr | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| | | | ru-site | 3/3, 100%, 2 unjudged | 5/5, 100% | +0 pp | 1.000 |
| | | | ru-docs | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| [2026-10-11T18:37:49Z](2026-10-11T18-37-49Z-204f9490-3727-47aa-aa7a-9d701c656842.json) | `claude-bridge/claude-opus-5-5` | high | all | 8/8, 100% | 4/8, 50% | +50 pp | 0.077 |
| | | | ru-readme | 2/2, 100% | 2/2, 100% | +0 pp | 1.000 |
| | | | ru-pr | 2/2, 100% | 0/2, 0% | +100 pp | 0.333 |
| | | | ru-site | 2/2, 100% | 0/2, 0% | +100 pp | 0.333 |
| | | | ru-docs | 2/2, 100% | 2/2, 100% | +0 pp | 1.000 |

## technical-writing

| Sweep | Model | Thinking | Case | Injected | Withheld | Difference | Fisher p |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [2026-10-10T07:39:21Z](2026-10-10T07-39-21Z-76e3965b-df2c-46f5-abee-fedadabd9cd9.json) | `claude-bridge/claude-opus-5-5` | high | all | 20/20, 100% | 0/20, 0% | +100 pp | 1.5e-11 |
| | | | en-readme | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| | | | ru-readme | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| | | | en-docs | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| | | | ru-docs | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| [2026-10-11T12:23:05Z](2026-10-11T12-23-05Z-aa66eea2-5792-4249-afff-c11f1584de75.json) | `opencode-go/muse-spark-1.3-contributor` | high | all | 20/20, 100% | 0/20, 0% | +100 pp | 1.5e-11 |
| | | | en-readme | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| | | | ru-readme | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| | | | en-docs | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| | | | ru-docs | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| [2026-10-11T12:36:18Z](2026-10-11T12-36-18Z-51fb6132-0629-4bce-8e8c-8fa763a692c9.json) | `claude-bridge/claude-opus-5-5` | high | all | 8/8, 100% | 0/8, 0% | +100 pp | 1.6e-4 |
| | | | en-readme | 2/2, 100% | 0/2, 0% | +100 pp | 0.333 |
| | | | ru-readme | 2/2, 100% | 0/2, 0% | +100 pp | 0.333 |
| | | | en-docs | 2/2, 100% | 0/2, 0% | +100 pp | 0.333 |
| | | | ru-docs | 2/2, 100% | 0/2, 0% | +100 pp | 0.333 |

## typescript-best-practices

| Sweep | Model | Thinking | Case | Injected | Withheld | Difference | Fisher p |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [2026-09-25T12:10:59Z](2026-09-25T12-10-59Z.json) | `opencode-go/muse-spark-1.3-contributor` | high | all | 10/10, 100% | 0/10, 0% | +100 pp | 1.1e-5 |
| | | | json-config | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| | | | error-message | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| [2026-09-25T16:57:56Z](2026-09-25T16-57-56Z-da03c1e1-57dc-4fa7-9071-6387291d9bba.json) | `openai-codex/gpt-6-luna` | xhigh | all | 10/10, 100% | 1/10, 10% | +90 pp | 1.2e-4 |
| | | | json-config | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| | | | error-message | 5/5, 100% | 1/5, 20% | +80 pp | 0.048 |
| [2026-09-25T18:01:31Z](2026-09-25T18-01-31Z-d0fd04b1-7cce-4cb5-a54b-8b371a6a6568.json) | `openai-codex/gpt-6-sol` | high | all | 10/10, 100% | 0/10, 0% | +100 pp | 1.1e-5 |
| | | | json-config | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| | | | error-message | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| [2026-09-25T19:00:10Z](2026-09-25T19-00-10Z-3c5c7a6c-6484-4900-9cda-dd0f5083a028.json) | `claude-bridge/claude-opus-5-5` | xhigh | all | 10/10, 100% | 3/10, 30% | +70 pp | 0.003 |
| | | | json-config | 5/5, 100% | 3/5, 60% | +40 pp | 0.444 |
| | | | error-message | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |

## unslop

| Sweep | Model | Thinking | Case | Injected | Withheld | Difference | Fisher p |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [2026-09-25T15:44:39Z](2026-09-25T15-44-39Z-dd0cc91f-1593-445c-bc17-dfc4d9438a26.json) | `opencode-go/muse-spark-1.3-contributor` | high | all | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| | | | copy-edit-overview | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| [2026-09-25T16:55:14Z](2026-09-25T16-55-14Z-61692362-fb7a-4ef6-8886-acf63ab71b5a.json) | `openai-codex/gpt-6-luna` | xhigh | all | 4/5, 80% | 0/5, 0% | +80 pp | 0.048 |
| | | | copy-edit-overview | 4/5, 80% | 0/5, 0% | +80 pp | 0.048 |
| [2026-09-25T17:58:26Z](2026-09-25T17-58-26Z-9c03cfcf-eb4f-4ada-aa02-3106b11da2e8.json) | `openai-codex/gpt-6-sol` | high | all | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| | | | copy-edit-overview | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| [2026-09-25T18:57:30Z](2026-09-25T18-57-30Z-832f43a7-d84e-4f9c-85c5-6c34332cd7a9.json) | `claude-bridge/claude-opus-5-5` | xhigh | all | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| | | | copy-edit-overview | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| [2026-10-10T07:52:39Z](2026-10-10T07-52-39Z-f90b96e5-21ba-4a32-977f-abbb4c31890f.json) | `claude-bridge/claude-opus-5-5` | high | all | 20/20, 100% | 15/20, 75% | +25 pp | 0.047 |
| | | | copy-edit-overview | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| | | | en-pr | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| | | | en-site | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| | | | ru-site | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| [2026-10-11T11:45:16Z](2026-10-11T11-45-16Z-3028d8b2-94b0-43e5-add5-4ce22d22e3de.json) | `claude-bridge/claude-opus-5-5` | high | all | 11/12, 92% | 12/12, 100% | -8 pp | 1.000 |
| | | | copy-edit-puff | 2/2, 100% | 2/2, 100% | +0 pp | 1.000 |
| | | | ru-pr | 2/2, 100% | 2/2, 100% | +0 pp | 1.000 |
| | | | en-site-index | 1/2, 50% | 2/2, 100% | -50 pp | 1.000 |
| | | | en-docs | 2/2, 100% | 2/2, 100% | +0 pp | 1.000 |
| | | | ru-docs | 2/2, 100% | 2/2, 100% | +0 pp | 1.000 |
| | | | en-readme | 2/2, 100% | 2/2, 100% | +0 pp | 1.000 |
| [2026-10-11T11:52:12Z](2026-10-11T11-52-12Z-34ed3a56-ad49-48e8-a1bf-01922c727513.json) | `opencode-go/muse-spark-1.3-contributor` | high | all | 19/20, 95% | 7/19, 37%, 1 unjudged | +58 pp | 1.4e-4 |
| | | | copy-edit-overview | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| | | | copy-edit-puff | 5/5, 100% | 0/4, 0%, 1 unjudged | +100 pp | 0.008 |
| | | | ru-pr | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| | | | en-site-index | 4/5, 80% | 2/5, 40% | +40 pp | 0.524 |
| [2026-10-11T11:57:01Z](2026-10-11T11-57-01Z-3d3edd4f-5ffd-4b1f-b968-b01eabb53e7d.json) | `claude-bridge/claude-opus-5-5` | high | all | 8/8, 100% | 6/8, 75% | +25 pp | 0.467 |
| | | | copy-edit-overview | 2/2, 100% | 0/2, 0% | +100 pp | 0.333 |
| | | | copy-edit-puff | 2/2, 100% | 2/2, 100% | +0 pp | 1.000 |
| | | | ru-pr | 2/2, 100% | 2/2, 100% | +0 pp | 1.000 |
| | | | en-site-index | 2/2, 100% | 2/2, 100% | +0 pp | 1.000 |

## writing-for-agents

| Sweep | Model | Thinking | Case | Injected | Withheld | Difference | Fisher p |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [2026-09-25T15:45:54Z](2026-09-25T15-45-54Z-bca74ad7-9688-4e6f-b746-bb734897da36.json) | `opencode-go/muse-spark-1.3-contributor` | high | all | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| | | | writing-for-agents-reference | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| [2026-09-25T16:56:28Z](2026-09-25T16-56-28Z-c7d8501f-f0c8-4ec3-b590-8554cdaea850.json) | `openai-codex/gpt-6-luna` | xhigh | all | 5/5, 100% | 1/5, 20% | +80 pp | 0.048 |
| | | | writing-for-agents-reference | 5/5, 100% | 1/5, 20% | +80 pp | 0.048 |
| [2026-09-25T17:59:47Z](2026-09-25T17-59-47Z-6dfd3a80-528f-4ec7-9d03-e11bcfe2bc1d.json) | `openai-codex/gpt-6-sol` | high | all | 4/5, 80% | 4/5, 80% | +0 pp | 1.000 |
| | | | writing-for-agents-reference | 4/5, 80% | 4/5, 80% | +0 pp | 1.000 |
| [2026-09-25T18:58:51Z](2026-09-25T18-58-51Z-24c287b2-e1d2-4280-93d7-5a6f24f57164.json) | `claude-bridge/claude-opus-5-5` | xhigh | all | 5/5, 100% | 4/5, 80% | +20 pp | 1.000 |
| | | | writing-for-agents-reference | 5/5, 100% | 4/5, 80% | +20 pp | 1.000 |
| [2026-10-10T07:56:28Z](2026-10-10T07-56-28Z-b3650e82-d085-4d90-8c7f-168932204bcf.json) | `claude-bridge/claude-opus-5-5` | high | all | 20/20, 100% | 4/20, 20% | +80 pp | 1.5e-7 |
| | | | writing-for-agents-reference | 5/5, 100% | 4/5, 80% | +20 pp | 1.000 |
| | | | positive-target | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| | | | lookup-left | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |
| | | | one-source | 5/5, 100% | 0/5, 0% | +100 pp | 0.008 |

## writing-for-people

| Sweep | Model | Thinking | Case | Injected | Withheld | Difference | Fisher p |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [2026-09-25T15:25:58Z](2026-09-25T15-25-58Z-c83e101b-53b5-4d06-b70b-80c68e2c3f26.json) | `opencode-go/muse-spark-1.3-contributor` | high | all | 3/3, 100%, 2 unjudged | 5/5, 100% | +0 pp | 1.000 |
| | | | readme-sections | 3/3, 100%, 2 unjudged | 5/5, 100% | +0 pp | 1.000 |
| [2026-09-25T16:50:31Z](2026-09-25T16-50-31Z-b086bc71-2f5d-4c27-823f-06ee2b2c8799.json) | `openai-codex/gpt-6-luna` | xhigh | all | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| | | | readme-sections | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| [2026-09-25T17:54:56Z](2026-09-25T17-54-56Z-1f24cf16-1949-4a91-87a3-abb00ca5318d.json) | `openai-codex/gpt-6-sol` | high | all | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| | | | readme-sections | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| [2026-09-25T18:51:44Z](2026-09-25T18-51-44Z-c96629cb-351a-4439-9064-71b05b6a54b9.json) | `claude-bridge/claude-opus-5-5` | xhigh | all | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| | | | readme-sections | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| [2026-10-11T14:20:54Z](2026-10-11T14-20-54Z-5812370d-bd9e-4b49-82bb-0da5ceb79f99.json) | `opencode-go/muse-spark-1.3-contributor` | high | all | 20/20, 100% | 20/20, 100% | +0 pp | 1.000 |
| | | | en-readme | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| | | | ru-readme | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| | | | en-site | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| | | | ru-site | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| [2026-10-11T15:05:48Z](2026-10-11T15-05-48Z-9d89b3c2-e3ac-4cae-9188-c6274941e78a.json) | `claude-bridge/claude-opus-5-5` | high | all | 8/8, 100% | 8/8, 100% | +0 pp | 1.000 |
| | | | en-readme | 2/2, 100% | 2/2, 100% | +0 pp | 1.000 |
| | | | ru-readme | 2/2, 100% | 2/2, 100% | +0 pp | 1.000 |
| | | | en-site | 2/2, 100% | 2/2, 100% | +0 pp | 1.000 |
| | | | ru-site | 2/2, 100% | 2/2, 100% | +0 pp | 1.000 |
| [2026-10-11T19:32:43Z](2026-10-11T19-32-43Z-fb88aa39-663a-45a9-b7aa-65fed67d05af.json) | `opencode-go/muse-spark-1.3-contributor` | high | all | 26/26, 100%, 14 unjudged | 33/33, 100%, 7 unjudged | +0 pp | 1.000 |
| | | | en-readme | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| | | | ru-readme | 3/3, 100%, 2 unjudged | 5/5, 100% | +0 pp | 1.000 |
| | | | en-pr | 4/4, 100%, 1 unjudged | 4/4, 100%, 1 unjudged | +0 pp | 1.000 |
| | | | ru-pr | 5/5, 100% | 4/4, 100%, 1 unjudged | +0 pp | 1.000 |
| | | | en-site | 4/4, 100%, 1 unjudged | 4/4, 100%, 1 unjudged | +0 pp | 1.000 |
| | | | ru-site | 2/2, 100%, 3 unjudged | 3/3, 100%, 2 unjudged | +0 pp | 1.000 |
| | | | en-errors | 3/3, 100%, 2 unjudged | 4/4, 100%, 1 unjudged | +0 pp | 1.000 |
| | | | ru-errors | -/5 | 4/4, 100%, 1 unjudged | - | - |
| [2026-10-11T20:09:36Z](2026-10-11T20-09-36Z-470a2003-7ffd-4232-9905-9d62575127a7.json) | `claude-bridge/claude-opus-5-5` | high | all | 16/16, 100% | 15/15, 100%, 1 unjudged | +0 pp | 1.000 |
| | | | en-readme | 2/2, 100% | 2/2, 100% | +0 pp | 1.000 |
| | | | ru-readme | 2/2, 100% | 2/2, 100% | +0 pp | 1.000 |
| | | | en-pr | 2/2, 100% | 2/2, 100% | +0 pp | 1.000 |
| | | | ru-pr | 2/2, 100% | 2/2, 100% | +0 pp | 1.000 |
| | | | en-site | 2/2, 100% | 2/2, 100% | +0 pp | 1.000 |
| | | | ru-site | 2/2, 100% | 1/1, 100%, 1 unjudged | +0 pp | 1.000 |
| | | | en-errors | 2/2, 100% | 2/2, 100% | +0 pp | 1.000 |
| | | | ru-errors | 2/2, 100% | 2/2, 100% | +0 pp | 1.000 |
| [2026-10-12T14:14:27Z](2026-10-12T14-14-27Z-7cfb5e78-f0b8-4f29-b857-4b5030210031.json) | `opencode-go/muse-spark-1.3-contributor` | high | all | 51/52, 98%, 8 unjudged | 44/46, 96%, 14 unjudged | +2 pp | 0.599 |
| | | | en-readme | 5/5, 100% | 4/4, 100%, 1 unjudged | +0 pp | 1.000 |
| | | | ru-readme | 1/1, 100%, 4 unjudged | 4/4, 100%, 1 unjudged | +0 pp | 1.000 |
| | | | en-pr | 5/5, 100% | 4/4, 100%, 1 unjudged | +0 pp | 1.000 |
| | | | ru-pr | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| | | | en-site | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| | | | ru-site | 4/4, 100%, 1 unjudged | 4/4, 100%, 1 unjudged | +0 pp | 1.000 |
| | | | en-errors | 4/4, 100%, 1 unjudged | 4/4, 100%, 1 unjudged | +0 pp | 1.000 |
| | | | ru-errors | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| | | | en-commit | 5/5, 100% | -/5 | - | - |
| | | | en-pr-fix | 5/5, 100% | 5/5, 100% | +0 pp | 1.000 |
| | | | en-readme-flag | 4/5, 80% | 3/5, 60% | +20 pp | 1.000 |
| | | | en-news | 3/3, 100%, 2 unjudged | 1/1, 100%, 4 unjudged | +0 pp | 1.000 |
| [2026-10-12T16:21:59Z](2026-10-12T16-21-59Z-7bcaf5ef-6348-4f05-9585-23409b7d8e8d.json) | `claude-bridge/claude-opus-5-5` | high | all | 20/24, 83% | 20/24, 83% | +0 pp | 1.000 |
| | | | en-readme | 2/2, 100% | 2/2, 100% | +0 pp | 1.000 |
| | | | ru-readme | 2/2, 100% | 2/2, 100% | +0 pp | 1.000 |
| | | | en-pr | 2/2, 100% | 2/2, 100% | +0 pp | 1.000 |
| | | | ru-pr | 2/2, 100% | 2/2, 100% | +0 pp | 1.000 |
| | | | en-site | 2/2, 100% | 2/2, 100% | +0 pp | 1.000 |
| | | | ru-site | 2/2, 100% | 2/2, 100% | +0 pp | 1.000 |
| | | | en-errors | 2/2, 100% | 2/2, 100% | +0 pp | 1.000 |
| | | | ru-errors | 2/2, 100% | 2/2, 100% | +0 pp | 1.000 |
| | | | en-commit | 0/2, 0% | 0/2, 0% | +0 pp | 1.000 |
| | | | en-pr-fix | 1/2, 50% | 1/2, 50% | +0 pp | 1.000 |
| | | | en-readme-flag | 2/2, 100% | 2/2, 100% | +0 pp | 1.000 |
| | | | en-news | 1/2, 50% | 1/2, 50% | +0 pp | 1.000 |
