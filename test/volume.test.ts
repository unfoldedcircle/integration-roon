import test from "ava";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  calculateVolumeUp,
  calculateVolumeDown,
  calculateVolumeNormalized,
  calculateVolumeAbsolute,
  calculateVolumeToPercentage
} from "../src/volume.js";
import type { Volume } from "node-roon-api";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve the path to the test data
// When running from dist, the path is relative to dist/test
const dataDir = path.resolve(__dirname, "../../test/data/volume-control");

function loadTestData(filename: string) {
  const filePath = path.join(dataDir, filename);
  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  return data.outputs[0].volume as Volume;
}

const jsonFiles = fs.readdirSync(dataDir).filter((f) => f.endsWith(".json"));

test("incremental volume: up and down", (t) => {
  const v: Volume = {
    type: "incremental",
    is_muted: false
  };

  t.deepEqual(calculateVolumeUp(v), { how: "relative", value: 1 });
  t.deepEqual(calculateVolumeDown(v), { how: "relative", value: -1 });

  t.throws(() => calculateVolumeNormalized(v, 0.5), {
    message: "Incremental volume does not support absolute volume setting"
  });
  t.throws(() => calculateVolumeAbsolute(v, 50), {
    message: "Incremental volume does not support absolute volume setting"
  });
});

test("volume without range: should throw for normalized", (t) => {
  const v: Volume = {
    type: "number",
    value: 50,
    is_muted: false
  };

  t.throws(() => calculateVolumeNormalized(v, 0.5), {
    message: "Volume range (min/max) not provided by Roon"
  });

  v.min = 1;
  t.throws(() => calculateVolumeNormalized(v, 0.5), {
    message: "Volume range (min/max) not provided by Roon"
  });

  v.min = undefined;
  v.max = 100;
  t.throws(() => calculateVolumeNormalized(v, 0.5), {
    message: "Volume range (min/max) not provided by Roon"
  });
});

test("custom volume ranges: up/down/normalized/absolute", (t) => {
  const ranges: { type: "db" | "number"; min: number; max: number; step?: number }[] = [
    { type: "number", min: 0, max: 100, step: 1 },
    { type: "number", min: 1, max: 100, step: 0.5 },
    { type: "db", min: -100, max: 0, step: 1 },
    { type: "db", min: -80, max: -10, step: 0.5 },
    { type: "db", min: -80, max: 18, step: 2 },
    { type: "number", min: 0, max: 80, step: 1 },
    { type: "db", min: -144, max: 0, step: 0.1 },
    { type: "number", min: 0, max: 127, step: 1 },
    { type: "number", min: 0, max: 100 } // Missing step
  ];

  for (const range of ranges) {
    const v: Volume = {
      type: range.type,
      min: range.min,
      max: range.max,
      step: range.step,
      is_muted: false
    };

    // make sure relative_step is using the fixed step size and not the provided Volume.step value!
    const expectedStep = 1;

    // Test Volume Up
    t.deepEqual(
      calculateVolumeUp(v),
      { how: "relative_step", value: expectedStep },
      `Up for range ${range.min}..${range.max} (${range.type})`
    );

    // Test Volume Down
    t.deepEqual(
      calculateVolumeDown(v),
      { how: "relative_step", value: -expectedStep },
      `Down for range ${range.min}..${range.max} (${range.type})`
    );

    // Test Volume Normalized (0.5)
    let midValue = range.min + (range.max - range.min) * 0.5;
    const step = range.step ?? 1.0;
    if (Number.isInteger(step)) {
      midValue = Math.round(midValue);
    }
    t.deepEqual(
      calculateVolumeNormalized(v, 0.5),
      { how: "absolute", value: midValue },
      `Normalized 0.5 for range ${range.min}..${range.max}`
    );

    // Test Volume Normalized (0.0 - min)
    t.deepEqual(
      calculateVolumeNormalized(v, 0),
      { how: "absolute", value: range.min },
      `Normalized 0.0 for range ${range.min}..${range.max}`
    );

    // Test Volume Normalized (1.0 - max)
    t.deepEqual(
      calculateVolumeNormalized(v, 1),
      { how: "absolute", value: range.max },
      `Normalized 1.0 for range ${range.min}..${range.max}`
    );

    // Test Volume Normalized (out of bounds)
    t.deepEqual(
      calculateVolumeNormalized(v, -10),
      { how: "absolute", value: range.min },
      `Normalized -10 (clamped) for range ${range.min}..${range.max}`
    );
    t.deepEqual(
      calculateVolumeNormalized(v, 10),
      { how: "absolute", value: range.max },
      `Normalized 10 (clamped) for range ${range.min}..${range.max}`
    );

    // Test Volume Absolute (midValue)
    t.deepEqual(
      calculateVolumeAbsolute(v, midValue),
      { how: "absolute", value: midValue },
      `Absolute midValue for range ${range.min}..${range.max}`
    );

    // Test Volume Absolute (clamped min)
    t.deepEqual(
      calculateVolumeAbsolute(v, range.min - 10),
      { how: "absolute", value: range.min },
      `Absolute min-10 for range ${range.min}..${range.max}`
    );

    // Test Volume Absolute (clamped max)
    t.deepEqual(
      calculateVolumeAbsolute(v, range.max + 10),
      { how: "absolute", value: range.max },
      `Absolute max+10 for range ${range.min}..${range.max}`
    );
  }
});

test("unknown volume type: should default to relative_step", (t) => {
  const v = {
    type: "unknown",
    step: 2,
    is_muted: false
  } as unknown as Volume;

  t.deepEqual(calculateVolumeUp(v), { how: "relative_step", value: 1 });
  t.deepEqual(calculateVolumeDown(v), { how: "relative_step", value: -1 });
});

test("volume absolute without range: should not clamp", (t) => {
  const v: Volume = {
    type: "number",
    value: 50,
    is_muted: false
  };

  t.deepEqual(calculateVolumeAbsolute(v, 75), { how: "absolute", value: 75 });
  t.deepEqual(calculateVolumeAbsolute(v, 25), { how: "absolute", value: 25 });
});

test("calculateVolumeToPercentage", (t) => {
  const cases: { v: Partial<Volume>; expected: number }[] = [
    { v: { type: "number", min: 0, max: 100, value: 50 }, expected: 50 },
    { v: { type: "number", min: 0, max: 100, value: 0 }, expected: 0 },
    { v: { type: "number", min: 0, max: 100, value: 100 }, expected: 100 },
    { v: { type: "db", min: -80, max: 0, value: -40 }, expected: 50 },
    { v: { type: "db", min: -80, max: 0, value: -80 }, expected: 0 },
    { v: { type: "db", min: -80, max: 0, value: 0 }, expected: 100 },
    { v: { type: "db", min: -80, max: 20, value: 0 }, expected: 80 },
    { v: { type: "incremental", value: 50 }, expected: 0 },
    { v: { type: "number", min: 0, max: 100, value: 33.3 }, expected: 33 },
    { v: { type: "number", min: 0, max: 100, value: 33.6 }, expected: 34 }
  ];

  for (const c of cases) {
    t.is(calculateVolumeToPercentage(c.v as Volume), c.expected, `Case ${JSON.stringify(c.v)}`);
  }
});

for (const file of jsonFiles) {
  test(`Volume control: ${file}`, (t) => {
    const v = loadTestData(file);
    const step = v.step ?? 1.0;

    // Test Volume Up
    t.deepEqual(calculateVolumeUp(v), { how: "relative_step", value: 1 });

    // Test Volume Down
    t.deepEqual(calculateVolumeDown(v), { how: "relative_step", value: -1 });

    if (v.min !== undefined && v.max !== undefined) {
      // Test Volume Normalized (0.5)
      let midValue = v.min + (v.max - v.min) * 0.5;
      const step = v.step ?? 1.0;
      if (Number.isInteger(step)) {
        midValue = Math.round(midValue);
      }
      t.deepEqual(calculateVolumeNormalized(v, 0.5), { how: "absolute", value: midValue });

      // Test Volume Normalized (0.0 - min)
      t.deepEqual(calculateVolumeNormalized(v, 0), { how: "absolute", value: v.min });

      // Test Volume Normalized (1.0 - max)
      t.deepEqual(calculateVolumeNormalized(v, 1), { how: "absolute", value: v.max });

      // Test Volume Absolute (midValue)
      t.deepEqual(calculateVolumeAbsolute(v, midValue), { how: "absolute", value: midValue });

      // Test Volume Absolute (clamped min)
      t.deepEqual(calculateVolumeAbsolute(v, v.min - 10), { how: "absolute", value: v.min });

      // Test Volume Absolute (clamped max)
      t.deepEqual(calculateVolumeAbsolute(v, v.max + 10), { how: "absolute", value: v.max });
    }
  });
}
