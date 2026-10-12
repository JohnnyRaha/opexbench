// Machine-learning models for classification and regression.
// X is an array of numeric rows. For classification y holds class indices 0..K-1 and
// models return a probability row per observation; for regression they return numbers.
const MML = (function () {
  'use strict';
  const sum = a => a.reduce((s, v) => s + v, 0);
  const mean = a => sum(a) / a.length;
  const argmax = a => a.reduce((b, v, i) => v > a[b] ? i : b, 0);
  const pick = (a, idx) => idx.map(i => a[i]);

  // Small seeded generator (mulberry32) so splits and forests are repeatable.
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function shuffle(n, r) {
    const a = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  // Returns a function that standardizes rows using the training means and SDs.
  function scaler(X) {
    const n = X.length, p = X[0].length, m = new Array(p).fill(0), s = new Array(p).fill(0);
    X.forEach(r => r.forEach((v, j) => { m[j] += v / n; }));
    X.forEach(r => r.forEach((v, j) => { s[j] += (v - m[j]) ** 2 / n; }));
    const sd = s.map(v => Math.sqrt(v) || 1);
    return rows => rows.map(r => r.map((v, j) => (v - m[j]) / sd[j]));
  }

  function solve(A, b) {
    const n = b.length, M = A.map((r, i) => r.concat([b[i]]));
    for (let c = 0; c < n; c++) {
      let piv = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
      [M[c], M[piv]] = [M[piv], M[c]];
      for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; for (let j = c; j <= n; j++) M[r][j] -= f * M[c][j]; }
    }
    const x = new Array(n);
    for (let i = n - 1; i >= 0; i--) { let v = M[i][n]; for (let j = i + 1; j < n; j++) v -= M[i][j] * x[j]; x[i] = v / M[i][i]; }
    return x;
  }

  // ---------- models ----------
  // Linear regression on standardized predictors; lambda > 0 gives ridge.
  function linear(X, y, o) {
    const sc = scaler(X), Z = sc(X), n = Z.length, p = Z[0].length, my = mean(y);
    const A = Array.from({ length: p }, (_, a) => Array.from({ length: p }, (_, b) => sum(Z.map(r => r[a] * r[b])) + (a === b ? o.lambda * n + 1e-8 : 0)));
    const w = solve(A, Array.from({ length: p }, (_, a) => sum(Z.map((r, i) => r[a] * (y[i] - my)))));
    return { predict: rows => sc(rows).map(r => my + sum(r.map((v, j) => v * w[j]))), coef: [w], intercept: [my] };
  }

  // Multinomial logistic regression fit by gradient descent with momentum on standardized predictors.
  function logistic(X, y, o) {
    const sc = scaler(X), Z = sc(X), n = Z.length, p = Z[0].length, K = o.K;
    const W = Array.from({ length: K }, () => new Array(p + 1).fill(0)), lr = Math.min(1, 2 / (p + 1));
    const V = W.map(w => w.slice());
    const probs = r => {
      const s = W.map(w => w[p] + sum(r.map((v, j) => v * w[j]))), mx = Math.max(...s), e = s.map(v => Math.exp(v - mx)), t = sum(e);
      return e.map(v => v / t);
    };
    for (let it = 0; it < 4000; it++) {
      const G = W.map(w => w.map((v, j) => j < p ? o.lambda * v : 0));
      let big = 0;
      Z.forEach((r, i) => {
        const pr = probs(r);
        for (let k = 0; k < K; k++) {
          const d = (pr[k] - (y[i] === k ? 1 : 0)) / n;
          for (let j = 0; j < p; j++) G[k][j] += d * r[j];
          G[k][p] += d;
        }
      });
      W.forEach((w, k) => w.forEach((_, j) => { V[k][j] = 0.9 * V[k][j] - lr * G[k][j]; w[j] += V[k][j]; big = Math.max(big, Math.abs(G[k][j])); }));
      if (big < 1e-5) break;
    }
    return { predict: rows => sc(rows).map(probs), coef: W.map(w => w.slice(0, p)), intercept: W.map(w => w[p]) };
  }

  function knn(X, y, o) {
    const sc = scaler(X), Z = sc(X), k = Math.min(o.k, Z.length);
    return {
      predict: rows => sc(rows).map(r => {
        const d = Z.map((z, i) => [sum(z.map((v, j) => (v - r[j]) ** 2)), i]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).slice(0, k);
        if (!o.K) return mean(d.map(a => y[a[1]]));
        const c = new Array(o.K).fill(0);
        d.forEach(a => { c[y[a[1]]] += 1 / k; });
        return c;
      })
    };
  }

  function naiveBayes(X, y, o) {
    const p = X[0].length, n = X.length;
    const eps = 1e-9 * Math.max(...Array.from({ length: p }, (_, j) => { const c = X.map(r => r[j]), m = mean(c); return mean(c.map(v => (v - m) ** 2)); }), 1e-12);
    const cls = Array.from({ length: o.K }, (_, k) => {
      const rows = X.filter((_, i) => y[i] === k);
      if (!rows.length) return null;
      const m = Array.from({ length: p }, (_, j) => mean(rows.map(r => r[j])));
      return { prior: Math.log(rows.length / n), m, v: m.map((mj, j) => mean(rows.map(r => (r[j] - mj) ** 2)) + eps) };
    });
    return {
      predict: rows => rows.map(r => {
        const ll = cls.map(c => c ? c.prior + sum(r.map((x, j) => -0.5 * Math.log(2 * Math.PI * c.v[j]) - (x - c.m[j]) ** 2 / (2 * c.v[j]))) : -Infinity);
        const mx = Math.max(...ll), e = ll.map(v => Math.exp(v - mx)), t = sum(e);
        return e.map(v => v / t);
      })
    };
  }

  // CART: Gini impurity for classification, variance for regression.
  function tree(X, y, o, r) {
    const p = X[0].length, K = o.K, imp = new Array(p).fill(0), mtry = Math.min(p, o.mtry || p);
    const counts = idx => { const c = new Array(K).fill(0); idx.forEach(i => c[y[i]]++); return c; };
    const gini = (c, n) => n * (1 - sum(c.map(v => (v / n) ** 2)));
    function grow(idx, depth) {
      const n = idx.length;
      let parent, value, all, tot = 0, tot2 = 0;
      if (K) { all = counts(idx); parent = gini(all, n); value = all.map(v => v / n); }
      else { idx.forEach(i => { tot += y[i]; tot2 += y[i] * y[i]; }); parent = tot2 - tot * tot / n; value = tot / n; }
      if (depth >= o.depth || n < 2 * o.minLeaf || parent < 1e-10) return { v: value };
      const feats = mtry < p ? shuffle(p, r).slice(0, mtry) : Array.from({ length: p }, (_, j) => j);
      let best = { gain: 1e-10 };
      for (const f of feats) {
        const s = idx.slice().sort((a, b) => X[a][f] - X[b][f]);
        const left = K ? new Array(K).fill(0) : null, right = K ? all.slice() : null;
        let ls = 0, ls2 = 0;
        for (let i = 0; i < n - 1; i++) {
          const yi = y[s[i]];
          if (K) { left[yi]++; right[yi]--; } else { ls += yi; ls2 += yi * yi; }
          const nl = i + 1, nr = n - nl;
          if (X[s[i]][f] === X[s[i + 1]][f] || nl < o.minLeaf || nr < o.minLeaf) continue;
          const child = K ? gini(left, nl) + gini(right, nr) : (ls2 - ls * ls / nl) + ((tot2 - ls2) - (tot - ls) ** 2 / nr);
          if (parent - child > best.gain) best = { gain: parent - child, f, t: (X[s[i]][f] + X[s[i + 1]][f]) / 2 };
        }
      }
      if (best.f == null) return { v: value };
      imp[best.f] += best.gain;
      return { f: best.f, t: best.t, l: grow(idx.filter(i => X[i][best.f] <= best.t), depth + 1), r: grow(idx.filter(i => X[i][best.f] > best.t), depth + 1) };
    }
    const root = grow(X.map((_, i) => i), 0);
    const one = row => { let nd = root; while (nd.f != null) nd = row[nd.f] <= nd.t ? nd.l : nd.r; return nd.v; };
    const size = nd => nd.f == null ? 1 : size(nd.l) + size(nd.r);
    return { predict: rows => rows.map(one), importance: imp, leaves: size(root) };
  }

  function forest(X, y, o, r) {
    const n = X.length, p = X[0].length, imp = new Array(p).fill(0), trees = [];
    const mtry = o.K ? Math.max(1, Math.round(Math.sqrt(p))) : Math.max(1, Math.ceil(p / 3));
    for (let t = 0; t < o.trees; t++) {
      const b = Array.from({ length: n }, () => Math.floor(r() * n));
      const tr = tree(pick(X, b), pick(y, b), Object.assign({}, o, { mtry }), r);
      tr.importance.forEach((v, j) => { imp[j] += v; });
      trees.push(tr);
    }
    return {
      predict: rows => {
        const all = trees.map(t => t.predict(rows));
        return rows.map((_, i) => o.K ? all[0][i].map((_, k) => mean(all.map(a => a[i][k]))) : mean(all.map(a => a[i])));
      },
      importance: imp
    };
  }

  const MODELS = { linear, logistic, knn, nb: naiveBayes, tree, forest };

  function fit(model, X, y, o, r) {
    const m = MODELS[model](X, y, o, r);
    if (m.importance) { const t = sum(m.importance) || 1; m.importance = m.importance.map(v => v / t); }
    return m;
  }

  // Predictions as { pred, proba } (proba is null for regression).
  function predict(m, X, K) {
    const out = m.predict(X);
    return K ? { pred: out.map(argmax), proba: out } : { pred: out, proba: null };
  }

  // ---------- validation ----------
  // o: { model, K, validation: 'holdout' | 'cv', testPct, folds, seed, ...hyperparameters }
  function evaluate(X, y, o) {
    const n = X.length, r = rng(o.seed), perm = shuffle(n, r);
    if (o.validation === 'cv') {
      const pred = new Array(n), proba = o.K ? new Array(n) : null, folds = [];
      for (let f = 0; f < o.folds; f++) {
        const test = perm.filter((_, i) => i % o.folds === f), train = perm.filter((_, i) => i % o.folds !== f);
        const out = predict(fit(o.model, pick(X, train), pick(y, train), o, r), pick(X, test), o.K);
        test.forEach((i, j) => { pred[i] = out.pred[j]; if (proba) proba[i] = out.proba[j]; });
        folds.push(o.K ? accuracy(pick(y, test), out.pred) : regMetrics(pick(y, test), out.pred).rmse);
      }
      const model = fit(o.model, X, y, o, r), all = perm.slice().sort((a, b) => a - b);
      return { model, folds, train: Object.assign({ idx: all }, predict(model, X, o.K)), test: { idx: all, pred, proba } };
    }
    const nTest = Math.min(n - 2, Math.max(1, Math.round(n * o.testPct / 100)));
    const test = perm.slice(0, nTest).sort((a, b) => a - b), train = perm.slice(nTest).sort((a, b) => a - b);
    const model = fit(o.model, pick(X, train), pick(y, train), o, r);
    return {
      model,
      train: Object.assign({ idx: train }, predict(model, pick(X, train), o.K)),
      test: Object.assign({ idx: test }, predict(model, pick(X, test), o.K))
    };
  }

  // ---------- metrics ----------
  const accuracy = (y, pred) => y.filter((v, i) => v === pred[i]).length / y.length;

  function confusion(y, pred, K) {
    const m = Array.from({ length: K }, () => new Array(K).fill(0));
    y.forEach((v, i) => m[v][pred[i]]++);
    return m;
  }

  function classReport(cm) {
    return cm.map((row, k) => {
      const tp = row[k], support = sum(row), predicted = sum(cm.map(r => r[k]));
      const precision = predicted ? tp / predicted : NaN, recall = support ? tp / support : NaN;
      return { precision, recall, f1: precision + recall > 0 ? 2 * precision * recall / (precision + recall) : NaN, support };
    });
  }

  // ROC curve and area for a binary problem; score is the probability of the positive class.
  function roc(yPos, score) {
    const order = score.map((_, i) => i).sort((a, b) => score[b] - score[a]);
    const P = yPos.filter(Boolean).length, N = yPos.length - P, fpr = [0], tpr = [0];
    let tp = 0, fp = 0, auc = 0;
    for (let i = 0; i < order.length;) {
      let j = i, dtp = 0, dfp = 0;
      while (j < order.length && score[order[j]] === score[order[i]]) { if (yPos[order[j]]) dtp++; else dfp++; j++; }
      auc += (dfp / N) * (tp + dtp / 2) / P;
      tp += dtp; fp += dfp;
      fpr.push(fp / N); tpr.push(tp / P);
      i = j;
    }
    return { fpr, tpr, auc: P && N ? auc : NaN };
  }

  function regMetrics(y, pred) {
    const m = mean(y), sse = sum(y.map((v, i) => (v - pred[i]) ** 2)), sst = sum(y.map(v => (v - m) ** 2));
    return { n: y.length, r2: 1 - sse / sst, rmse: Math.sqrt(sse / y.length), mae: mean(y.map((v, i) => Math.abs(v - pred[i]))) };
  }

  return { rng, pick, evaluate, predict, accuracy, confusion, classReport, roc, regMetrics };
})();
