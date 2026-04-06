import { parseScript } from "meriyah";
import { readdir, readFile, stat } from "node:fs/promises";
import { ccDir } from "./sketchDataPaths";
import { fileURLToPath } from "node:url";

interface ASTProfile {
  nodeTypeCounts: Map<string, number>;
  totalNodes: number;
  stringLiterals: Set<string>;
  numericLiterals: Set<number>;
  identifiers: Set<string>;
  functionCount: number;
  topLevelStructure: string[];
}

function walkAST(node: any, visitor: (node: any) => void) {
  if (!node || typeof node !== "object") return;
  if (node.type) visitor(node);
  for (const key of Object.keys(node)) {
    if (key === "type") continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) walkAST(item, visitor);
    } else if (child && typeof child === "object" && child.type) {
      walkAST(child, visitor);
    }
  }
}

function profileAST(source: string): ASTProfile | null {
  let ast;
  try {
    ast = parseScript(source, {
      ranges: false,
      loc: false,
    });
  } catch {
    return null;
  }

  const profile: ASTProfile = {
    nodeTypeCounts: new Map(),
    totalNodes: 0,
    stringLiterals: new Set(),
    numericLiterals: new Set(),
    identifiers: new Set(),
    functionCount: 0,
    topLevelStructure: [],
  };

  // Top-level structure
  if (ast.body) {
    for (const stmt of ast.body) {
      profile.topLevelStructure.push(stmt.type);
    }
  }

  walkAST(ast, (node) => {
    profile.totalNodes++;
    const count = profile.nodeTypeCounts.get(node.type) || 0;
    profile.nodeTypeCounts.set(node.type, count + 1);

    if (node.type === "Literal") {
      if (typeof node.value === "string") profile.stringLiterals.add(node.value);
      if (typeof node.value === "number") profile.numericLiterals.add(node.value);
    }

    if (node.type === "Identifier") {
      profile.identifiers.add(node.name);
    }

    if (
      node.type === "FunctionDeclaration" ||
      node.type === "FunctionExpression" ||
      node.type === "ArrowFunctionExpression"
    ) {
      profile.functionCount++;
    }
  });

  return profile;
}

function setSimilarity(a: Set<string | number>, b: Set<string | number>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection++;
  }
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 1 : intersection / union;
}

function distributionSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  const allKeys = new Set([...a.keys(), ...b.keys()]);
  if (allKeys.size === 0) return 1;

  // cosine similarity on node type count vectors
  let dotProduct = 0;
  let magA = 0;
  let magB = 0;

  for (const key of allKeys) {
    const va = a.get(key) || 0;
    const vb = b.get(key) || 0;
    dotProduct += va * vb;
    magA += va * va;
    magB += vb * vb;
  }

  const mag = Math.sqrt(magA) * Math.sqrt(magB);
  return mag === 0 ? 0 : dotProduct / mag;
}

function structureSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  // LCS-based similarity
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const lcsLen = dp[m][n];
  return (2 * lcsLen) / (m + n);
}

export interface CCComparisonResult {
  previousFile: string;
  similarity: number;
  breakdown: {
    nodeTypeDistribution: number;
    stringLiterals: number;
    numericLiterals: number;
    identifiers: number;
    structure: number;
    functionCountDelta: number;
    nodeTotalDelta: number;
  };
}

function compareProfiles(a: ASTProfile, b: ASTProfile): Omit<CCComparisonResult, "previousFile"> {
  const nodeTypeDist = distributionSimilarity(a.nodeTypeCounts, b.nodeTypeCounts);
  const stringSim = setSimilarity(a.stringLiterals as Set<string | number>, b.stringLiterals as Set<string | number>);
  const numericSim = setSimilarity(a.numericLiterals as Set<string | number>, b.numericLiterals as Set<string | number>);
  const identSim = setSimilarity(a.identifiers as Set<string | number>, b.identifiers as Set<string | number>);
  const structSim = structureSimilarity(a.topLevelStructure, b.topLevelStructure);

  const funcMax = Math.max(a.functionCount, b.functionCount, 1);
  const funcDelta = 1 - Math.abs(a.functionCount - b.functionCount) / funcMax;

  const nodeMax = Math.max(a.totalNodes, b.totalNodes, 1);
  const nodeDelta = 1 - Math.abs(a.totalNodes - b.totalNodes) / nodeMax;

  // Weighted overall similarity
  const similarity =
    nodeTypeDist * 0.30 +
    structSim * 0.25 +
    funcDelta * 0.15 +
    nodeDelta * 0.10 +
    numericSim * 0.10 +
    stringSim * 0.05 +
    identSim * 0.05;

  return {
    similarity,
    breakdown: {
      nodeTypeDistribution: nodeTypeDist,
      stringLiterals: stringSim,
      numericLiterals: numericSim,
      identifiers: identSim,
      structure: structSim,
      functionCountDelta: funcDelta,
      nodeTotalDelta: nodeDelta,
    },
  };
}

async function getLastCCFile(): Promise<{ path: string; name: string } | null> {
  let entries;
  try {
    entries = await readdir(ccDir);
  } catch {
    return null;
  }

  const ccFiles = entries.filter((f) => f.endsWith(".deob.js"));
  if (ccFiles.length === 0) return null;

  // Find the most recently modified file
  let latest: { path: string; name: string; mtime: number } | null = null;

  for (const file of ccFiles) {
    const filePath = fileURLToPath(new URL(file, ccDir));
    try {
      const s = await stat(filePath);
      if (!latest || s.mtimeMs > latest.mtime) {
        latest = { path: filePath, name: file, mtime: s.mtimeMs };
      }
    } catch {
      continue;
    }
  }

  return latest ? { path: latest.path, name: latest.name } : null;
}

export async function compareWithLastCC(
  newDeobfuscatedSource: string,
): Promise<CCComparisonResult | null> {
  const lastFile = await getLastCCFile();
  if (!lastFile) return null;

  let previousSource: string;
  try {
    previousSource = await readFile(lastFile.path, "utf-8");
  } catch {
    return null;
  }

  const newProfile = profileAST(newDeobfuscatedSource);
  const oldProfile = profileAST(previousSource);

  if (!newProfile || !oldProfile) return null;

  const result = compareProfiles(newProfile, oldProfile);

  return {
    previousFile: lastFile.name,
    ...result,
  };
}
