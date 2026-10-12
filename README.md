# OpExBench

A Lean Six Sigma workbench in the browser. It combines a DMAIC project workspace, value stream mapping and process mining, the quality tools (control charts, capability, gage R&R, DOE), and the statistics, graphs and machine learning to back them up. No install and no server-side code; everything runs on the page.

## Run it

Open `index.html` in a browser, or serve the folder:

```bash
python -m http.server 8765
```

Then go to http://localhost:8765. An internet connection is needed on first load for the two libraries fetched from a CDN (jStat for distributions, Plotly for charts).

## What it does

**Worksheet** — type, paste from a spreadsheet, or open a CSV. Columns are numeric or text (`-T`); blank cells and `*` are missing values. The worksheet is kept in the browser between visits.

**Stat**

| Group | Analyses |
| --- | --- |
| Basic Statistics | Descriptive statistics, tally, one-sample t and Z, two-sample t (Welch or pooled), paired t, one proportion (exact), two proportions (with Fisher's exact), two variances (F and Levene), correlation (Pearson, Spearman), normality (Anderson–Darling) |
| ANOVA | One-way ANOVA with Tukey comparisons, test for equal variances |
| Regression | Simple and multiple linear regression with VIF, R-sq(pred), unusual observations and residual plots |
| Tables | Chi-square test for association (raw or summarized data) |
| Nonparametrics | One-sample Wilcoxon, Mann-Whitney, Kruskal-Wallis |

**Graph** — scatterplot, matrix plot, histogram (with normal curve), probability plot, boxplot, individual value plot, interval plot, bar chart, pie chart, time series plot. Most accept a grouping column.

**Machine Learning** — classification and regression with a held-out test set or k-fold cross-validation.

| Task | Models | Output |
| --- | --- | --- |
| Classification | Random forest, decision tree, logistic regression, k-nearest neighbors, Gaussian naive Bayes | Accuracy against a majority-class baseline, confusion matrix, precision / recall / F1, ROC curve and AUC for two classes |
| Regression | Random forest, decision tree, linear (ridge) regression, k-nearest neighbors | R-sq, RMSE, MAE, actual-vs-predicted and residual plots |

Predictors can be numeric or text (text columns become indicator variables). Tree models report predictor importance; linear and logistic models report standardized coefficients. Predictions can be written back to the worksheet, including for rows that have predictors but no response. Splits and forests are seeded, so results are repeatable. Models train in the browser tab, so they suit data up to a few thousand rows.

## Lean Six Sigma

**Quality** — the measurement and control tools of a Six Sigma project.

| Group | Tools |
| --- | --- |
| Control charts | I-MR, Xbar-R, Xbar-S, P, NP, C, U, with tests for special causes |
| Capability and measurement | Process capability (Cp, Cpk, Pp, Ppk, Cpm, expected PPM), crossed gage R&R (ANOVA method), DPMO and sigma level |
| Prioritise | Pareto chart |
| Design of experiments | Create and analyze two-level full factorial designs (effects, Pareto of effects, main-effect and interaction plots) |
| Planning | Power and sample size for t tests |

**Process** — analysis of how the work actually flows.

- **Process mining** reads an event log (case ID, activity, timestamp, optionally an end timestamp and a resource) and produces a process map, lead-time statistics, the longest hand-overs, the common paths, a ranked list of improvement opportunities (queues, rework loops, non-standard paths, hand-offs, slow-case tail) and a screening score for automation candidates.
- **Value stream map** takes a table of steps (cycle time, wait, value-adding flag, yield, and optionally people, changeover and uptime) and draws the map: supplier, customer and information flow, process and data boxes, queues, the lead-time ladder and kaizen bursts on the biggest problems. It also reports lead time, process cycle efficiency, rolled throughput yield, takt time and the bottleneck. Diagrams can be saved as SVG.
- **OEE** breaks equipment effectiveness into availability, performance and quality.

The automation score is a heuristic for shortlisting, not a verdict: it rewards high volume, consistent duration, a predictable next step and a large share of the work.

**Project (DMAIC)** — a workspace for the project documents, organised by phase, with a tollgate checklist per phase and shortcuts to the analyses each phase needs: project charter, SIPOC, voice of the customer to CTQ, stakeholder analysis, data collection plan, fishbone diagram, 5 Whys, root-cause verification log, impact / effort matrix, FMEA, automation opportunities, pilot plan, control plan, benefits tracking and lessons learned. Projects are saved in the browser, can be exported and imported as a file, and print as a single report.

Not included: fractional factorial and response-surface designs, attribute agreement analysis, non-normal capability, multi-vari charts, and EWMA and CUSUM charts. The value stream map is generated from the step table rather than drawn by hand, and shows one current-state map at a time.

## Layout

- `js/quality.js` — control charts, capability, gage R&R and power calculations
- `js/process.js` — event-log mining, automation scoring and value-stream arithmetic
- `js/lss.js` — the Quality and Process dialogs and their output
- `js/project.js` — the DMAIC project workspace

- `js/stats.js` — the statistical routines, as pure functions over number arrays
- `js/ml.js` — the machine-learning models, validation and metrics
- `js/analyses.js` — one definition per analysis or graph: its dialog fields and its output
- `js/sheet.js` — worksheet data model, grid and CSV handling
- `js/app.js` — menus, dialogs and session output

## Accuracy

The results for the built-in sample data were compared against SciPy and NumPy (t-tests, ANOVA, Tukey, Levene, regression, chi-square, exact binomial, Fisher, Anderson–Darling statistic, Mann-Whitney, Wilcoxon, Kruskal-Wallis) and agree to the displayed precision. Mann-Whitney and Wilcoxon p-values use the normal approximation with continuity correction.

The deterministic machine-learning models (k-nearest neighbors, naive Bayes, linear and logistic regression, decision trees) were compared against scikit-learn fitted on the same rows and give the same accuracy and R-sq. Random forests use a different random stream from scikit-learn, so their results are comparable but not identical.

All code here is original and the methods are standard textbook ones. The sample data is synthetic.
