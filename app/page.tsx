'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Papa from 'papaparse';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  LineChart,
  Line,
} from 'recharts';

type RawRow = Record<string, string | number | null | undefined>;

type IndexKey =
  | 'livingEnvironment'
  | 'belonging'
  | 'raSupport'
  | 'staff'
  | 'empowerment'
  | 'overallExperience';

type IndexConfig = {
  key: IndexKey;
  label: string;
  description: string;
  color: string;
  questions: string[];
  rowFilter?: (row: RawRow) => boolean;
};

type Dataset = {
  id: string;
  label: string;
  rows: RawRow[];
  source: 'demo' | 'upload';
};

type ViewMode = 'overview' | 'comparisons';

const DEMO_DATASET_URL = '/fake_reslife_dataset.csv';

// Column names exactly as they appear in the response CSV
const COL_BUILDING = 'Which building do you currently live in?';
const COL_CLASS_YEAR = 'What is your current class year?';
const COL_RA_ASSIGNED = 'Do you have a Resident Assistant (RA) assigned to your community?';

// Open-ended columns
const COL_POSITIVE =
  'What has been the most positive aspect of your residence hall experience?';
const COL_IMPROVE =
  'What would most improve your satisfaction or sense of belonging?';
const COL_COMMENTS = 'Any additional comments for Residence Life staff?';

// Index configuration based on survey sections
const INDEXES: IndexConfig[] = [
  {
    key: 'livingEnvironment',
    label: 'Living Environment',
    description:
      'Safety, inclusivity, facilities, and how the hall feels day-to-day.',
    color: '#38bdf8',
    questions: [
      'My residence hall feels like a safe environment.',
      'I feel comfortable walking in and around my hall, even at night.',
      'My hall provides a welcoming and inclusive community.',
      'Physical facilities (cleanliness, maintenance, common spaces) meet my needs.',
      'Amenities (lounges, study areas, kitchens) are adequate and usable.',
      'Community events and programs contribute to my sense of belonging.',
    ],
  },
  {
    key: 'belonging',
    label: 'Belonging & Connection',
    description:
      'Feeling noticed, valued, able to be oneself, and connected to others.',
    color: '#6366f1',
    questions: [
      'I feel a strong sense of belonging in my residence hall.',
      'I have developed meaningful friendships within my hall.',
      'People in my hall notice when I am not around.',
      'I feel that my presence and participation matter to others in my community.',
      'I feel comfortable expressing my identity in my residence hall.',
      'My hall environment makes it easy to meet and connect with others.',
    ],
  },
  {
    key: 'raSupport',
    label: 'RA Support',
    description:
      'Approachability, communication, and support from Resident Assistants.',
    color: '#22c55e',
    questions: [
      'My RA is approachable and easy to contact.',
      'My RA keeps me informed about hall policies, resources, and events.',
      'My RA supports my personal and academic success.',
      'My RA responds to my needs in a timely manner.',
      'My RA encourages community connection and belonging.',
      'I feel comfortable seeking assistance from my RA when needed.',
    ],
    rowFilter: (row: RawRow) => {
      const v = String(row[COL_RA_ASSIGNED] ?? '').trim();
      return v === 'Yes';
    },
  },
  {
    key: 'staff',
    label: 'Professional Staff',
    description:
      'Visibility, responsiveness, inclusivity, and voice with pro staff.',
    color: '#f97316',
    questions: [
      'Professional staff are visible and accessible in my hall.',
      'Professional staff respond effectively to student concerns.',
      'Professional staff follow up after issues are reported.',
      'Professional staff promote an inclusive and welcoming environment.',
      'I have opportunities to share feedback with professional staff.',
      'I believe my opinions are considered in hall-level decisions.',
    ],
  },
  {
    key: 'empowerment',
    label: 'Empowerment & Development',
    description:
      'Growth, voice, independence, and self-authorship in the hall.',
    color: '#ec4899',
    questions: [
      'I feel empowered to make decisions that affect my residential experience.',
      'Living on campus helps me reflect on my personal values and goals.',
      'When I disagree with staff or policies, I feel comfortable expressing my perspective.',
      'My experiences in the hall have helped me become more independent and confident.',
    ],
  },
  {
    key: 'overallExperience',
    label: 'Overall Experience',
    description:
      'Big-picture residential satisfaction and connection to USF.',
    color: '#a855f7',
    questions: [
      'Living in on-campus housing has positively impacted my USF experience.',
      'I would recommend living on campus to other students.',
      'If given the option, I would choose to live on campus again.',
      'Because of my residential experience, I feel more connected to the broader USF community.',
    ],
  },
];

type IndexScore = {
  key: IndexKey;
  label: string;
  color: string;
  mean: number;
};

type QuestionStat = {
  question: string;
  mean: number;
};

const DATASET_COLORS = [
  '#38bdf8',
  '#a855f7',
  '#22c55e',
  '#f97316',
  '#ec4899',
  '#6366f1',
];

function toLikert(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  if (n < 1 || n > 5) return null;
  return n;
}

function computeQuestionMeans(
  rows: RawRow[],
  questions: string[],
  rowFilter?: (row: RawRow) => boolean,
): QuestionStat[] {
  return questions.map((q) => {
    let sum = 0;
    let count = 0;

    rows.forEach((row) => {
      if (rowFilter && !rowFilter(row)) return;
      const score = toLikert(row[q]);
      if (score !== null) {
        sum += score;
        count += 1;
      }
    });

    const mean = count > 0 ? sum / count : 0;
    return { question: q, mean };
  });
}

function computeIndexScores(rows: RawRow[]): IndexScore[] {
  return INDEXES.map((idx) => {
    const qs = computeQuestionMeans(rows, idx.questions, idx.rowFilter);
    const validMeans = qs.map((q) => q.mean).filter((m) => m > 0);
    const mean =
      validMeans.length > 0
        ? validMeans.reduce((acc, v) => acc + v, 0) / validMeans.length
        : 0;
    return {
      key: idx.key,
      label: idx.label,
      color: idx.color,
      mean,
    };
  });
}

function filterRowsByHall(rows: RawRow[], hallFilter: string): RawRow[] {
  if (hallFilter === 'ALL') return rows;
  return rows.filter(
    (r) => String(r[COL_BUILDING] ?? '').trim() === hallFilter,
  );
}

function inferDatasetLabel(fileName: string): string {
  const yearMatch = fileName.match(/(20\d{2})/);
  if (yearMatch) {
    return `${yearMatch[1]} Survey`;
  }
  const base = fileName.replace(/\.[^/.]+$/, '');
  return base || 'Uploaded Survey';
}

function extractYearOrOrder(label: string, fallbackIndex: number): number {
  const m = label.match(/(20\d{2})/);
  if (m) {
    return parseInt(m[1], 10);
  }
  // Put non-year datasets first, then by order added
  return 1000 + fallbackIndex;
}

export default function ResidenceLifeDashboardPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [activeDatasetId, setActiveDatasetId] = useState<string | null>(null);
  const [hallFilter, setHallFilter] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [loadingDemo, setLoadingDemo] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [trendIndexKey, setTrendIndexKey] =
    useState<IndexKey>('overallExperience');

  // Load demo dataset on mount
  useEffect(() => {
    const loadDemo = async () => {
      try {
        setLoadingDemo(true);
        const res = await fetch(DEMO_DATASET_URL);
        if (!res.ok) {
          throw new Error(
            'Could not load fake_reslife_dataset.csv. Make sure it is in your /public folder.',
          );
        }
        const text = await res.text();
        const parsed = Papa.parse<RawRow>(text, {
          header: true,
          skipEmptyLines: true,
        });

        if (parsed.errors.length) {
          console.warn('CSV parse errors (demo):', parsed.errors);
        }

        const demoDataset: Dataset = {
          id: 'demo',
          label: 'Demo Survey (example data)',
          rows: parsed.data,
          source: 'demo',
        };

        setDatasets([demoDataset]);
        setActiveDatasetId('demo');
      } catch (e: any) {
        console.error(e);
        setError(e.message ?? 'Failed to load demo dataset');
      } finally {
        setLoadingDemo(false);
      }
    };

    loadDemo();
  }, []);

  const activeDataset: Dataset | null = useMemo(() => {
    if (!datasets.length) return null;
    if (activeDatasetId) {
      const found = datasets.find((d) => d.id === activeDatasetId);
      if (found) return found;
    }
    return datasets[0];
  }, [datasets, activeDatasetId]);

  // Halls across all datasets for filter dropdown
  const hallOptions = useMemo(() => {
    const halls = new Set<string>();
    datasets.forEach((ds) => {
      ds.rows.forEach((r) => {
        const v = String(r[COL_BUILDING] ?? '').trim();
        if (v) halls.add(v);
      });
    });
    return Array.from(halls).sort();
  }, [datasets]);

  const filteredRows = useMemo(() => {
    if (!activeDataset) return [];
    return filterRowsByHall(activeDataset.rows, hallFilter);
  }, [activeDataset, hallFilter]);

  const perIndexQuestions: Record<IndexKey, QuestionStat[]> = useMemo(() => {
    const result = {} as Record<IndexKey, QuestionStat[]>;
    INDEXES.forEach((idx) => {
      result[idx.key] = computeQuestionMeans(
        filteredRows,
        idx.questions,
        idx.rowFilter,
      );
    });
    return result;
  }, [filteredRows]);

  // Index scores per dataset (for compare charts, respecting hall filter)
  const indexScoresByDataset: Record<string, IndexScore[]> = useMemo(() => {
    const map: Record<string, IndexScore[]> = {};
    datasets.forEach((ds) => {
      const rowsForHall = filterRowsByHall(ds.rows, hallFilter);
      map[ds.id] = computeIndexScores(rowsForHall);
    });
    return map;
  }, [datasets, hallFilter]);

  const activeIndexScores: IndexScore[] = useMemo(() => {
    if (!activeDataset) return [];
    return indexScoresByDataset[activeDataset.id] ?? [];
  }, [activeDataset, indexScoresByDataset]);

  const radarData = useMemo(
    () =>
      activeIndexScores.map((idx) => ({
        index: idx.label,
        score: Number(idx.mean.toFixed(2)),
        fullMark: 5,
      })),
    [activeIndexScores],
  );

  const totalResponses = filteredRows.length;

  // Demographics summaries for the current filtered view
  const buildingCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredRows.forEach((r) => {
      const v = String(r[COL_BUILDING] ?? '').trim();
      if (!v) return;
      counts[v] = (counts[v] || 0) + 1;
    });
    return counts;
  }, [filteredRows]);

  const classYearCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredRows.forEach((r) => {
      const v = String(r[COL_CLASS_YEAR] ?? '').trim();
      if (!v) return;
      counts[v] = (counts[v] || 0) + 1;
    });
    return counts;
  }, [filteredRows]);

  const raYesRate = useMemo(() => {
    if (!filteredRows.length) return 0;
    let yes = 0;
    let total = 0;
    filteredRows.forEach((r) => {
      const v = String(r[COL_RA_ASSIGNED] ?? '').trim();
      if (!v) return;
      total += 1;
      if (v === 'Yes') yes += 1;
    });
    return total > 0 ? yes / total : 0;
  }, [filteredRows]);

  // Open-ended previews (for filtered rows)
  const sampleText = (rows: RawRow[], colName: string, max = 5): string[] => {
    const vals: string[] = [];
    rows.forEach((r) => {
      const v = String(r[colName] ?? '').trim();
      if (v && vals.length < max && !vals.includes(v)) {
        vals.push(v);
      }
    });
    return vals;
  };

  const positiveSamples = useMemo(
    () => sampleText(filteredRows, COL_POSITIVE, 5),
    [filteredRows],
  );
  const improveSamples = useMemo(
    () => sampleText(filteredRows, COL_IMPROVE, 5),
    [filteredRows],
  );
  const commentSamples = useMemo(
    () => sampleText(filteredRows, COL_COMMENTS, 5),
    [filteredRows],
  );

  // Comparison across datasets (grouped bar chart)
  const comparisonData = useMemo(() => {
    if (datasets.length < 2) return [];
    return INDEXES.map((idx) => {
      const row: any = { index: idx.label };
      datasets.forEach((ds) => {
        const scores = indexScoresByDataset[ds.id] ?? [];
        const score = scores.find((s) => s.key === idx.key)?.mean ?? 0;
        row[ds.label] = Number(score.toFixed(2));
      });
      return row;
    });
  }, [datasets, indexScoresByDataset]);

  // Trend line data: one selected index across datasets
  const trendLineData = useMemo(() => {
    if (datasets.length < 2) return [];
    const rows = datasets
      .map((ds, idx) => {
        const scores = indexScoresByDataset[ds.id] ?? [];
        const s = scores.find((sc) => sc.key === trendIndexKey);
        return {
          datasetLabel: ds.label,
          order: extractYearOrOrder(ds.label, idx),
          score: s ? Number(s.mean.toFixed(2)) : 0,
        };
      })
      .filter((r) => r.score > 0);
    rows.sort((a, b) => a.order - b.order);
    return rows;
  }, [datasets, indexScoresByDataset, trendIndexKey]);

  const trendDomain: [number, number] = useMemo(() => {
    if (!trendLineData.length) return [1, 5];
    const scores = trendLineData.map((r) => r.score);
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const pad = 0.2;
    return [Math.max(1, min - pad), Math.min(5, max + pad)];
  }, [trendLineData]);

  const handleHallFilterChange: React.ChangeEventHandler<HTMLSelectElement> = (
    e,
  ) => {
    setHallFilter(e.target.value);
  };

  const handleDatasetTabClick = (id: string) => {
    setActiveDatasetId(id);
  };

  const handleFileUpload: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    setUploadError(null);
    const files = e.target.files;
    if (!files || !files.length) return;

    const fileArray = Array.from(files);

    fileArray.forEach((file, idx) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const text = reader.result as string;
          const parsed = Papa.parse<RawRow>(text, {
            header: true,
            skipEmptyLines: true,
          });

          if (parsed.errors.length) {
            console.warn(`CSV parse errors (${file.name}):`, parsed.errors);
          }

          const newDataset: Dataset = {
            id: `${file.name}-${Date.now()}-${idx}`,
            label: inferDatasetLabel(file.name),
            rows: parsed.data,
            source: 'upload',
          };

          setDatasets((prev) => {
            const next = [...prev, newDataset];
            return next;
          });

          setActiveDatasetId((prevActive) => prevActive ?? newDataset.id);
        } catch (err: any) {
          console.error(err);
          setUploadError(
            `Failed to parse file "${file.name}". Make sure it's a CSV export from Google Forms.`,
          );
        }
      };
      reader.onerror = () => {
        setUploadError(`Could not read file "${file.name}".`);
      };
      reader.readAsText(file);
    });

    // Reset input so same file can be uploaded again if needed
    e.target.value = '';
  };

  const deleteDataset = (id: string) => {
    const ds = datasets.find((d) => d.id === id);
    if (!ds || ds.source === 'demo') return;
    if (
      !window.confirm(
        `Remove dataset "${ds.label}" from this session? (You can always re-upload the CSV later.)`,
      )
    ) {
      return;
    }
    setDatasets((prev) => {
      const next = prev.filter((d) => d.id !== id);
      if (activeDatasetId === id) {
        setActiveDatasetId(next.length ? next[0].id : null);
      }
      return next;
    });
  };

  const trendIndexConfig = INDEXES.find((i) => i.key === trendIndexKey);

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-8 space-y-8">
        {/* Header */}
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
              Residence Life Satisfaction &amp; Belonging Dashboard
            </h1>
            <p className="max-w-2xl text-base text-slate-300">
              A story-focused view of how students are experiencing on-campus housing. Built so
              Residence Life staff can interpret the data without needing to be data experts.
            </p>
          </div>
          <div className="flex flex-col items-start md:items-end gap-2">
            <span className="inline-flex items-center rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-200 shadow-sm">
              ● Prototype mode – synthetic demo dataset
            </span>
            <p className="text-xs text-slate-400 text-right max-w-xs">
              The default view uses fake data seeded from your real survey structure. Upload exports
              from Google Forms to see how this would look with actual survey years.
            </p>
          </div>
        </header>

        {/* Upload controls */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-lg space-y-3">
          <h2 className="text-base font-semibold text-slate-100">
            Add additional years or cohorts
          </h2>
          <p className="text-sm text-slate-300 max-w-2xl">
            Upload one CSV per survey administration (for example,{' '}
            <span className="font-mono">ResLife_2025.csv</span> and{' '}
            <span className="font-mono">ResLife_2026.csv</span>). Each file should be a direct export
            from Google Forms using the same survey structure. Files are only processed in your
            browser.
          </p>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex items-center gap-3">
              <label
                htmlFor="csvUpload"
                className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-sm cursor-pointer hover:border-sky-500 hover:text-sky-200 transition"
              >
                Select CSV files…
              </label>
              <input
                id="csvUpload"
                type="file"
                accept=".csv"
                multiple
                className="hidden"
                onChange={handleFileUpload}
              />
              <p className="text-xs text-slate-400">
                Tip: include the year in the filename (e.g.,{' '}
                <span className="font-mono">ResLife_2026.csv</span>) so the label is clearer.
              </p>
            </div>
            {uploadError && (
              <p className="text-xs text-rose-300">{uploadError}</p>
            )}
          </div>
        </section>

        {/* Dataset tabs */}
        {datasets.length > 0 && (
          <section className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-2">
              {datasets.map((ds) => {
                const isActive = activeDataset?.id === ds.id;
                return (
                  <div
                    key={ds.id}
                    className={`relative inline-flex items-center rounded-full px-4 py-1.5 text-sm border transition ${
                      isActive
                        ? 'border-sky-500 bg-sky-500/10 text-sky-100'
                        : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-sky-500/60 hover:text-sky-100'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleDatasetTabClick(ds.id)}
                      className="z-10"
                    >
                      {ds.label}
                      {ds.source === 'demo' && (
                        <span className="ml-1 text-[0.6rem] uppercase text-slate-400">
                          demo
                        </span>
                      )}
                    </button>

                    {ds.source === 'upload' && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteDataset(ds.id);
                        }}
                        aria-label={`Remove ${ds.label}`}
                        className="absolute -top-1.5 -right-1.5 h-5 w-5 flex items-center justify-center rounded-full border border-rose-400/40 bg-slate-950/80 text-rose-300 text-xs shadow-lg hover:bg-rose-500/20 hover:border-rose-400 hover:text-rose-200 transition"
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-slate-400">
              Use the tabs to switch between survey years or cohorts. The hall filter and charts below
              will always reflect the selected dataset.
            </p>
          </section>
        )}

        {/* Filter row + view mode toggle */}
        {datasets.length > 0 && (
          <section className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-2">
              <div className="text-sm text-slate-300">
                <p className="font-semibold text-slate-100">Filter by hall</p>
                <p>
                  Choose a specific building to see how students in that space are doing, or view all
                  halls together for a campus-wide snapshot. This filter also applies to the
                  comparisons.
                </p>
              </div>
              <div className="inline-flex items-center gap-1 rounded-full bg-slate-900/80 border border-slate-800 p-1 w-fit">
                <button
                  type="button"
                  onClick={() => setViewMode('overview')}
                  className={`px-3 py-1.5 text-xs rounded-full transition ${
                    viewMode === 'overview'
                      ? 'bg-sky-500 text-white'
                      : 'text-slate-300 hover:text-sky-200'
                  }`}
                >
                  Overview
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('comparisons')}
                  className={`px-3 py-1.5 text-xs rounded-full transition ${
                    viewMode === 'comparisons'
                      ? 'bg-sky-500 text-white'
                      : 'text-slate-300 hover:text-sky-200'
                  }`}
                >
                  Comparisons &amp; trends
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <label
                htmlFor="hallFilter"
                className="text-sm text-slate-300 whitespace-nowrap"
              >
                Showing results for:
              </label>
              <select
                id="hallFilter"
                value={hallFilter}
                onChange={handleHallFilterChange}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                <option value="ALL">All halls</option>
                {hallOptions.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
          </section>
        )}

        {/* Loading / error */}
        {loadingDemo && (
          <p className="text-sm text-slate-300">
            Loading demo dataset from <code>fake_reslife_dataset.csv</code>…
          </p>
        )}
        {error && <p className="text-sm text-rose-300">Error: {error}</p>}

        {/* No data */}
        {!loadingDemo && datasets.length === 0 && (
          <p className="text-sm text-slate-300">
            No datasets loaded yet. Make sure{' '}
            <code>fake_reslife_dataset.csv</code> exists in your{' '}
            <code>/public</code> folder, or upload a CSV export from Google Forms.
          </p>
        )}

        {/* ===================== OVERVIEW VIEW ===================== */}
        {viewMode === 'overview' && activeDataset && filteredRows.length > 0 && (
          <>
            {/* Overview cards for active dataset */}
            <section className="grid gap-4 md:grid-cols-[2fr,3fr]">
              {/* About your residents (filtered view) */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg space-y-3">
                <h2 className="text-base font-semibold text-slate-100">
                  Who is represented in this view?
                </h2>
                <p className="text-sm text-slate-300">
                  These numbers reflect only the students included in the current dataset and hall
                  filter. This helps you see who you’re hearing from when you look at the scores.
                </p>
                <p className="text-sm text-slate-400">
                  Dataset:{' '}
                  <span className="text-slate-100">{activeDataset.label}</span>
                  {hallFilter !== 'ALL' && (
                    <>
                      {' · '}Hall filter:{' '}
                      <span className="text-slate-100">{hallFilter}</span>
                    </>
                  )}
                </p>
                <div className="grid grid-cols-3 gap-3 text-sm text-slate-200 mt-2">
                  <div className="rounded-xl bg-slate-950/80 border border-slate-800 px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-slate-400">
                      Responses in view
                    </p>
                    <p className="mt-1 text-xl font-semibold">
                      {totalResponses}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-950/80 border border-slate-800 px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-slate-400">
                      Halls represented
                    </p>
                    <p className="mt-1 text-xl font-semibold">
                      {Object.keys(buildingCounts).length || '–'}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-950/80 border border-slate-800 px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-slate-400">
                      Have an RA assigned
                    </p>
                    <p className="mt-1 text-xl font-semibold">
                      {Math.round(raYesRate * 100)}%
                    </p>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-slate-300">
                  <div>
                    <p className="mb-1 text-xs text-slate-400 uppercase tracking-wide">
                      Top halls in this view
                    </p>
                    {Object.entries(buildingCounts)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 4)
                      .map(([hall, count]) => (
                        <p key={hall}>
                          <span className="text-slate-100">{hall}</span> ·{' '}
                          {count} responses
                        </p>
                      ))}
                    {Object.keys(buildingCounts).length === 0 && (
                      <p>No hall data available.</p>
                    )}
                  </div>
                  <div>
                    <p className="mb-1 text-xs text-slate-400 uppercase tracking-wide">
                      Class years represented
                    </p>
                    {Object.entries(classYearCounts)
                      .sort((a, b) => b[1] - a[1])
                      .map(([cy, count]) => (
                        <p key={cy}>
                          <span className="text-slate-100">{cy}</span> · {count}
                        </p>
                      ))}
                    {Object.keys(classYearCounts).length === 0 && (
                      <p>No class year data available.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Index KPI cards */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg space-y-3">
                <h2 className="text-base font-semibold text-slate-100">
                  Big picture · Key areas of the residential experience
                </h2>
                <p className="text-sm text-slate-300">
                  Each card shows the average score (1–5) for a cluster of related questions in the
                  current dataset and hall filter. Scores closer to 5 indicate stronger agreement with
                  positive statements.
                </p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {activeIndexScores.map((idx) => (
                    <div
                      key={idx.key}
                      className="rounded-xl bg-slate-950/80 border border-slate-800 px-4 py-3 flex flex-col justify-between"
                    >
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-400">
                          {idx.label}
                        </p>
                        <p className="mt-1 text-2xl font-semibold">
                          {idx.mean > 0 ? idx.mean.toFixed(2) : '–'}
                          <span className="ml-1 text-sm text-slate-400">
                            / 5
                          </span>
                        </p>
                      </div>
                      <p className="mt-1 text-sm text-slate-400">
                        {INDEXES.find((i) => i.key === idx.key)?.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* Radar chart of indices for active dataset */}
            <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg space-y-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-slate-100">
                    How do the different areas compare in this view?
                  </h2>
                  <p className="text-sm text-slate-300 max-w-xl">
                    This radar chart shows each area of the residential experience on the same 1–5
                    scale, using only the responses included in the current dataset and hall filter.
                  </p>
                </div>
                <p className="text-sm text-slate-400">
                  Think of this as the “shape” of the experience for{' '}
                  {hallFilter === 'ALL'
                    ? 'all halls combined.'
                    : hallFilter + '.'}
                </p>
              </div>

              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#1f2937" />
                    <PolarAngleAxis
                      dataKey="index"
                      tick={{ fill: '#e5e7eb', fontSize: 12 }}
                    />
                    <PolarRadiusAxis
                      angle={30}
                      domain={[1, 5]}
                      tick={{ fill: '#9ca3af', fontSize: 11 }}
                    />
                    <Radar
                      name="Average score"
                      dataKey="score"
                      stroke="#38bdf8"
                      fill="#38bdf8"
                      fillOpacity={0.35}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#020617',
                        border: '1px solid #1f2937',
                        fontSize: 12,
                      }}
                      labelStyle={{ color: '#e5e7eb' }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* Section-by-section breakdown for active dataset */}
            <section className="space-y-6">
              {INDEXES.map((idx) => {
                const stats = perIndexQuestions[idx.key];
                if (!stats || stats.length === 0) return null;
                const chartData = stats.map((s) => ({
                  question: s.question,
                  label:
                    s.question.length > 60
                      ? s.question.slice(0, 57) + '…'
                      : s.question,
                  mean: Number(s.mean.toFixed(2)),
                }));

                return (
                  <div
                    key={idx.key}
                    className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg space-y-3"
                  >
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                      <div>
                        <h3 className="text-base font-semibold text-slate-100">
                          {idx.label}
                        </h3>
                        <p className="text-sm text-slate-300 max-w-xl">
                          {idx.description}
                        </p>
                      </div>
                      <p className="text-sm text-slate-400">
                        Each bar shows the average response to a specific statement on a 1–5 scale,
                        using only the responses in the current dataset and hall filter.
                      </p>
                    </div>

                    <div className="grid gap-4 md:grid-cols-[2fr,3fr]">
                      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm space-y-2">
                        <p className="mb-1 text-xs text-slate-400 uppercase tracking-wide">
                          Questions in this section
                        </p>
                        {stats.map((s) => (
                          <div key={s.question} className="space-y-0.5">
                            <p className="font-medium text-slate-100">
                              {s.question}
                            </p>
                            <p className="text-slate-300">
                              Average:{' '}
                              {s.mean > 0 ? s.mean.toFixed(2) : '–'} / 5
                            </p>
                          </div>
                        ))}
                      </div>

                      <div className="h-80 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={chartData}
                            layout="vertical"
                            margin={{
                              top: 10,
                              right: 32,
                              left: 10,
                              bottom: 10,
                            }}
                          >
                            <CartesianGrid
                              strokeDasharray="3 3"
                              stroke="#1f2937"
                            />
                            <XAxis
                              type="number"
                              domain={[1, 5]}
                              tick={{ fill: '#e5e7eb', fontSize: 12 }}
                            />
                            <YAxis
                              type="category"
                              dataKey="label"
                              tick={{ fill: '#e5e7eb', fontSize: 11 }}
                              width={260}
                            />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: '#020617',
                                border: '1px solid #1f2937',
                                fontSize: 12,
                              }}
                              labelStyle={{ color: '#e5e7eb' }}
                              labelFormatter={(_, payload) => {
                                const full =
                                  payload &&
                                  payload[0] &&
                                  (payload[0].payload as any).question;
                                return full || '';
                              }}
                              formatter={(value) => {
                                if (typeof value === 'number') {
                                  return [
                                    `${value.toFixed(2)} / 5`,
                                    'Average score',
                                  ];
                                }
                                return [value, 'Average score'];
                              }}
                            />
                            <Legend
                              wrapperStyle={{
                                color: '#e5e7eb',
                                fontSize: 12,
                              }}
                            />
                            <Bar
                              dataKey="mean"
                              name="Average score (1–5)"
                              radius={[0, 6, 6, 0]}
                              fill={idx.color}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                );
              })}
            </section>

            {/* Open-ended responses for active dataset */}
            <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg space-y-4">
              <h2 className="text-base font-semibold text-slate-100">
                What students are actually saying (sample comments)
              </h2>
              <p className="text-sm text-slate-300 max-w-2xl">
                These are small samples of the open-ended responses from the current dataset and hall
                filter. In a real assessment cycle, you might code themes (for example, “noise,”
                “maintenance,” “community”) and share both quotes and summarized findings.
              </p>
              <div className="grid gap-4 md:grid-cols-3 text-sm text-slate-200">
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    Most positive aspects
                  </p>
                  {positiveSamples.length === 0 && (
                    <p className="text-slate-400">No responses yet.</p>
                  )}
                  {positiveSamples.map((t, i) => (
                    <blockquote
                      key={i}
                      className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 italic"
                    >
                      “{t}”
                    </blockquote>
                  ))}
                </div>
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    What would improve satisfaction
                  </p>
                  {improveSamples.length === 0 && (
                    <p className="text-slate-400">No responses yet.</p>
                  )}
                  {improveSamples.map((t, i) => (
                    <blockquote
                      key={i}
                      className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 italic"
                    >
                      “{t}”
                    </blockquote>
                  ))}
                </div>
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    Additional comments
                  </p>
                  {commentSamples.length === 0 && (
                    <p className="text-slate-400">No responses yet.</p>
                  )}
                  {commentSamples.map((t, i) => (
                    <blockquote
                      key={i}
                      className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 italic"
                    >
                      “{t}”
                    </blockquote>
                  ))}
                </div>
              </div>
            </section>
          </>
        )}

        {/* ===================== COMPARISONS VIEW ===================== */}
        {viewMode === 'comparisons' && (
          <>
            {datasets.length <= 1 && (
              <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg">
                <h2 className="text-base font-semibold text-slate-100">
                  Comparisons &amp; trends
                </h2>
                <p className="text-sm text-slate-300 mt-1">
                  You&apos;ll see comparisons here once you have at least two datasets loaded (for
                  example, 2025 and 2026). Try uploading another year&apos;s CSV from Google Forms.
                </p>
              </section>
            )}

            {datasets.length > 1 && comparisonData.length > 0 && (
              <>
                {/* Grouped bar comparisons */}
                <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <div>
                      <h2 className="text-base font-semibold text-slate-100">
                        Compare survey years · Index scores side by side
                      </h2>
                      <p className="text-sm text-slate-300 max-w-2xl">
                        This chart shows each major area (Living Environment, Belonging, RA Support,
                        etc.) on the x-axis, with a bar for each dataset (year or cohort). It respects
                        your hall filter, so you can, for example, compare Lone Mountain North across
                        multiple years.
                      </p>
                    </div>
                    <p className="text-xs text-slate-400 max-w-xs">
                      Use this for quick “which year is higher?” conversations. Shifts of about
                      0.3–0.5 points are usually worth paying attention to.
                    </p>
                  </div>

                  <div className="h-96 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={comparisonData}
                        margin={{ top: 10, right: 32, left: 10, bottom: 40 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#1f2937"
                        />
                        <XAxis
                          dataKey="index"
                          tick={{ fill: '#e5e7eb', fontSize: 11 }}
                          angle={-20}
                          textAnchor="end"
                          height={60}
                        />
                        <YAxis
                          type="number"
                          domain={[1, 5]}
                          tick={{ fill: '#e5e7eb', fontSize: 12 }}
                          label={{
                            value: 'Average score (1–5)',
                            angle: -90,
                            position: 'insideLeft',
                            fill: '#e5e7eb',
                            fontSize: 12,
                          }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#020617',
                            border: '1px solid #1f2937',
                            fontSize: 12,
                          }}
                          labelStyle={{ color: '#e5e7eb' }}
                          formatter={(value) => {
                            if (typeof value === 'number') {
                              return [
                                `${value.toFixed(2)} / 5`,
                                'Average score',
                              ];
                            }
                            return [value, 'Average score'];
                          }}
                        />
                        <Legend
                          wrapperStyle={{
                            color: '#e5e7eb',
                            fontSize: 12,
                          }}
                          verticalAlign="top"
                          height={32}
                        />
                        {datasets.map((ds, idx) => (
                          <Bar
                            key={ds.id}
                            dataKey={ds.label}
                            name={ds.label}
                            fill={DATASET_COLORS[idx % DATASET_COLORS.length]}
                            radius={[4, 4, 0, 0]}
                          />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>

                {/* Single-index trend line: cleaner and zoomed */}
                {trendLineData.length > 0 && trendIndexConfig && (
                  <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg space-y-4">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                      <div className="space-y-1 max-w-xl">
                        <h2 className="text-base font-semibold text-slate-100">
                          Trend over time · Index scores by dataset
                        </h2>
                        <p className="text-sm text-slate-300">
                          Select one area below to see how its average score changes across survey
                          datasets (often years), using the current hall filter.
                        </p>
                        <p className="text-xs text-slate-400">
                          This is better for “Are we getting better at Belonging / RA Support / etc.?”
                          than trying to look at six overlapping lines.
                        </p>
                      </div>
                      <div className="flex flex-col items-start gap-1">
                        <label
                          htmlFor="trendIndexSelect"
                          className="text-xs uppercase tracking-wide text-slate-400"
                        >
                          Area to show in the trend line
                        </label>
                        <select
                          id="trendIndexSelect"
                          value={trendIndexKey}
                          onChange={(e) =>
                            setTrendIndexKey(e.target.value as IndexKey)
                          }
                          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                        >
                          {INDEXES.map((idx) => (
                            <option key={idx.key} value={idx.key}>
                              {idx.label}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-slate-400 max-w-xs">
                          {trendIndexConfig.description}
                        </p>
                      </div>
                    </div>

                    <div className="h-96 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={trendLineData}
                          margin={{ top: 10, right: 32, left: 10, bottom: 40 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#1f2937"
                          />
                          <XAxis
                            dataKey="datasetLabel"
                            tick={{ fill: '#e5e7eb', fontSize: 11 }}
                          />
                          <YAxis
                            domain={trendDomain}
                            tick={{ fill: '#e5e7eb', fontSize: 12 }}
                            label={{
                              value: 'Average score (1–5)',
                              angle: -90,
                              position: 'insideLeft',
                              fill: '#e5e7eb',
                              fontSize: 12,
                            }}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#020617',
                              border: '1px solid #1f2937',
                              fontSize: 12,
                            }}
                            labelStyle={{ color: '#e5e7eb' }}
                            formatter={(value) => {
                              if (typeof value === 'number') {
                                return [
                                  `${value.toFixed(2)} / 5`,
                                  trendIndexConfig.label,
                                ];
                              }
                              return [value, trendIndexConfig.label];
                            }}
                          />
                          <Legend
                            wrapperStyle={{
                              color: '#e5e7eb',
                              fontSize: 12,
                            }}
                            verticalAlign="top"
                            height={32}
                          />
                          <Line
                            type="monotone"
                            dataKey="score"
                            name={trendIndexConfig.label}
                            stroke={trendIndexConfig.color}
                            strokeWidth={2}
                            dot={{ r: 3 }}
                            activeDot={{ r: 5 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </section>
                )}
              </>
            )}
          </>
        )}

        {/* Footer */}
        <footer className="border-t border-slate-800 pt-4 text-xs text-slate-500">
          <p>
            This dashboard is wired to a synthetic demo dataset plus whatever CSVs you upload from
            Google Forms. When you&apos;re ready, you can lock this into a single survey year and use
            screenshots or exports for end-of-year reports, RA training, and leadership
            conversations.
          </p>
        </footer>
      </div>
    </main>
  );
}
