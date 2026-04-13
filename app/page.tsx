"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import NextImage from "next/image";
import { toPng } from "html-to-image";

type Mood = "hard" | "okay" | "great";
type GoalType =
  | "reading"
  | "workout"
  | "study"
  | "writing"
  | "healthy eating"
  | "sleep"
  | "water"
  | "journaling"
  | "photo"
  | "meditation"
  | "organizing"
  | "custom";

type DayEntry = {
  dayIndex: number;
  completed: boolean | null;
  mood: Mood | null;
  note: string;
  completedGoalIndexes: number[];
  imageDataUrl: string;
};

type Goal = {
  title: string;
  type: GoalType;
};

type Challenge = {
  name: string;
  startDate: string;
  endDate: string;
  goals: Goal[];
  entries: DayEntry[];
};

const STORAGE_KEY = "ten-day-challenge-v1";
const AI_SETTINGS_KEY = "ten-day-ai-settings-v1";

type AiProvider = "openai" | "doubao" | "claude" | "custom";

type AiSettings = {
  provider: AiProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
};

const DEFAULT_AI_SETTINGS: AiSettings = {
  provider: "openai",
  apiKey: "",
  baseUrl: "",
  model: "",
};

const GOAL_COMPLETED_COPY: Partial<Record<GoalType, string>> = {
  reading: "已阅读",
  workout: "已训练",
  writing: "已输出",
  "healthy eating": "已健康",
  sleep: "已早睡",
  photo: "已记录",
  water: "已补水",
};

const GOAL_TYPE_ZH: Record<GoalType, string> = {
  reading: "阅读",
  workout: "训练",
  study: "学习",
  writing: "输出",
  "healthy eating": "健康饮食",
  sleep: "早睡",
  water: "补水",
  journaling: "日记",
  photo: "拍照记录",
  meditation: "冥想",
  organizing: "整理",
  custom: "自定义",
};

const GOAL_TYPE_OPTIONS: GoalType[] = [
  "reading",
  "workout",
  "study",
  "writing",
  "healthy eating",
  "sleep",
  "water",
  "journaling",
  "photo",
  "meditation",
  "organizing",
  "custom",
];

const MOOD_STYLE: Record<Mood, string> = {
  hard: "border border-orange-300 bg-orange-50 text-orange-900 shadow-[inset_0_0_0_1px_rgba(251,146,60,0.25)]",
  okay: "border border-sky-300 bg-sky-50 text-sky-900 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.2)]",
  great:
    "border border-emerald-300 bg-emerald-50 text-emerald-900 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.2)]",
};

function formatDate(input: Date | string) {
  const date = typeof input === "string" ? new Date(input) : input;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(date);
}

function getStartOfYear(date: Date) {
  return new Date(date.getFullYear(), 0, 1);
}

function getDayOfYear(date: Date) {
  const yearStart = getStartOfYear(date).getTime();
  return Math.floor((date.getTime() - yearStart) / 86400000) + 1;
}

function getYearProgress(date: Date) {
  const dayOfYear = getDayOfYear(date);
  const year = date.getFullYear();
  const daysInYear = year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0) ? 366 : 365;
  const percent = Math.min(100, Math.round((dayOfYear / daysInYear) * 100));
  const block = Math.min(36, Math.ceil(dayOfYear / 10));
  return { percent, block };
}

function getCurrentCycleDayIndex(challenge: Challenge, today: Date) {
  const start = new Date(challenge.startDate);
  const diff = Math.floor((today.getTime() - start.getTime()) / 86400000);
  return Math.min(9, Math.max(0, diff));
}

function createEmptyEntries() {
  return Array.from({ length: 10 }, (_, dayIndex) => ({
    dayIndex,
    completed: null,
    mood: null,
    note: "",
    completedGoalIndexes: [],
    imageDataUrl: "",
  }));
}

function createDefaultChallenge(today: Date): Challenge {
  const start = new Date(today);
  start.setDate(today.getDate() - 2);
  const end = new Date(start);
  end.setDate(start.getDate() + 9);

  return {
    name: "十日专注计划",
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    goals: [
      { title: "阅读20分钟", type: "reading" },
      { title: "训练30分钟", type: "workout" },
    ],
    entries: createEmptyEntries(),
  };
}

function getCompletedActionCopy(goalType?: GoalType) {
  if (!goalType) return "完成今日";
  return GOAL_COMPLETED_COPY[goalType] ?? "完成今日";
}

function getMoodDotClass(mood: Mood | null) {
  if (mood === "hard") return "bg-orange-400";
  if (mood === "okay") return "bg-sky-400";
  if (mood === "great") return "bg-emerald-400";
  return "bg-slate-300";
}

function getDayStateClass(entry: DayEntry) {
  if (entry.completed === true) return "bg-slate-900 text-white border-slate-900";
  if (entry.completed === false) return "bg-slate-100 text-slate-600 border-slate-300";
  return "bg-white text-slate-500 border-slate-200";
}

function isValidGoalType(type: string): type is GoalType {
  return [
    "reading",
    "workout",
    "study",
    "writing",
    "healthy eating",
    "sleep",
    "water",
    "journaling",
    "photo",
    "meditation",
    "organizing",
    "custom",
  ].includes(type);
}

function normalizeChallenge(data: unknown): Challenge | null {
  if (!data || typeof data !== "object") return null;
  const candidate = data as Partial<Challenge>;
  if (
    typeof candidate.name !== "string" ||
    typeof candidate.startDate !== "string" ||
    typeof candidate.endDate !== "string" ||
    !Array.isArray(candidate.goals) ||
    !Array.isArray(candidate.entries)
  ) {
    return null;
  }

  const goals = candidate.goals
    .map((goal) => {
      if (!goal || typeof goal !== "object") return null;
      const parsed = goal as Partial<Goal>;
      if (
        typeof parsed.title !== "string" ||
        typeof parsed.type !== "string" ||
        !isValidGoalType(parsed.type)
      ) {
        return null;
      }
      return { title: parsed.title, type: parsed.type };
    })
    .filter((goal): goal is Goal => Boolean(goal))
    .slice(0, 3);

  const entries = candidate.entries
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const parsed = entry as Partial<DayEntry>;
      if (
        typeof parsed.dayIndex !== "number" ||
        parsed.dayIndex < 0 ||
        parsed.dayIndex > 9 ||
        ![true, false, null].includes(parsed.completed as boolean | null) ||
        !["hard", "okay", "great", null].includes(parsed.mood as Mood | null) ||
        typeof parsed.note !== "string"
      ) {
        return null;
      }
      return {
        dayIndex: parsed.dayIndex,
        completed: parsed.completed as boolean | null,
        mood: parsed.mood as Mood | null,
        note: parsed.note,
        completedGoalIndexes: Array.isArray((parsed as DayEntry).completedGoalIndexes)
          ? (parsed as DayEntry).completedGoalIndexes.filter(
              (index) => typeof index === "number" && index >= 0 && index <= 2,
            )
          : [],
        imageDataUrl:
          typeof (parsed as DayEntry).imageDataUrl === "string"
            ? (parsed as DayEntry).imageDataUrl
            : "",
      };
    })
    .filter((entry): entry is DayEntry => Boolean(entry));

  if (goals.length < 1 || entries.length !== 10) return null;

  return {
    name: candidate.name,
    startDate: candidate.startDate,
    endDate: candidate.endDate,
    goals,
    entries: entries.sort((a, b) => a.dayIndex - b.dayIndex),
  };
}

function buildPromptFromChallengeData(
  challenge: Challenge,
  completedDays: number,
  moodStats: { hard: number; okay: number; great: number },
  goalStats: Array<{ title: string; completionCount: number }>,
) {
  const noteSummary = challenge.entries
    .filter((entry) => entry.note.trim())
    .map((entry) => `第${entry.dayIndex + 1}天：${entry.note.trim()}`)
    .slice(0, 8)
    .join("\n");

  return `你是一个冷静、简洁、专业的成长复盘助手。请基于以下10天挑战数据，输出一段中文复盘。

要求：
1) 语气克制、清晰、温和，不要鸡血，不要夸张。
2) 总长度控制在 180-280 字。
3) 结构包含：
   - 本轮节奏判断（整体表现）
   - 最稳定的目标（或最值得肯定的一点）
   - 情绪模式观察
   - 下一轮 1-2 条可执行建议

挑战名称：${challenge.name}
日期范围：${formatDate(challenge.startDate)} - ${formatDate(challenge.endDate)}
完成天数：${completedDays} / 10
情绪统计：有点难 ${moodStats.hard} 天，还可以 ${moodStats.okay} 天，状态好 ${moodStats.great} 天
目标统计：
${goalStats.map((goal) => `- ${goal.title}：${goal.completionCount} 次`).join("\n")}

记录明细：
${challenge.entries
  .map(
    (entry) =>
      `第${entry.dayIndex + 1}天：${entry.completed === null ? "未记录" : entry.completed ? "完成" : "跳过"}，情绪=${
        entry.mood ?? "无"
      }，完成目标索引=${entry.completedGoalIndexes.join(",") || "无"}`,
  )
  .join("\n")}

备注摘录：
${noteSummary || "无"}
`;
}

async function generateAiReview(
  settings: AiSettings,
  prompt: string,
): Promise<string> {
  if (!settings.apiKey.trim()) {
    throw new Error("missing_api_key");
  }

  if (settings.provider === "claude") {
    const model = settings.model.trim() || "claude-3-5-sonnet-latest";
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": settings.apiKey.trim(),
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 600,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!response.ok) {
      throw new Error("request_failed");
    }
    const data = (await response.json()) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    const text =
      data.content?.find((item) => item.type === "text")?.text?.trim() ?? "";
    if (!text) throw new Error("empty_result");
    return text;
  }

  const isOpenAi = settings.provider === "openai";
  const endpoint = isOpenAi
    ? "https://api.openai.com/v1/chat/completions"
    : `${(settings.baseUrl.trim() || "https://api.openai.com/v1").replace(/\/$/, "")}/chat/completions`;
  const model = settings.model.trim() || (isOpenAi ? "gpt-4.1-mini" : "gpt-4o-mini");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey.trim()}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.6,
      messages: [
        {
          role: "system",
          content: "你是一个冷静、简洁、注重可执行建议的中文复盘助手。",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error("request_failed");
  }
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) throw new Error("empty_result");
  return text;
}

function startNewCycleWithGoals(goals: Goal[], today: Date): Challenge {
  const start = new Date(today);
  const end = new Date(start);
  end.setDate(start.getDate() + 9);
  return {
    name: "新一轮10天挑战",
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    goals,
    entries: createEmptyEntries(),
  };
}

function compressImageToDataUrl(file: File, maxWidth = 720, quality = 0.78): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const width = Math.round(img.width * scale);
        const height = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("无法处理图片"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("图片读取失败"));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}

export default function Home() {
  const [isHydrated, setIsHydrated] = useState(false);
  const [clientToday, setClientToday] = useState<Date | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingName, setEditingName] = useState("");
  const [imageError, setImageError] = useState("");
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [isGeneratingShare, setIsGeneratingShare] = useState(false);
  const [shareImageUrl, setShareImageUrl] = useState("");
  const [shareError, setShareError] = useState("");
  const [aiSettings, setAiSettings] = useState<AiSettings>(DEFAULT_AI_SETTINGS);
  const [isGeneratingAiReview, setIsGeneratingAiReview] = useState(false);
  const [aiReviewText, setAiReviewText] = useState("");
  const [aiReviewError, setAiReviewError] = useState("");
  const [showAiSettings, setShowAiSettings] = useState(false);
  const shareCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const now = new Date();
    let nextChallenge = createDefaultChallenge(now);
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = normalizeChallenge(JSON.parse(saved));
        if (parsed) {
          nextChallenge = parsed;
        }
      } catch {
        // Ignore broken storage content.
      }
    }
    setClientToday(now);
    setChallenge(nextChallenge);
    setSelectedDayIndex(getCurrentCycleDayIndex(nextChallenge, now));
    const savedAiSettings = window.localStorage.getItem(AI_SETTINGS_KEY);
    if (savedAiSettings) {
      try {
        const parsed = JSON.parse(savedAiSettings) as Partial<AiSettings>;
        setAiSettings({
          provider:
            parsed.provider === "openai" ||
            parsed.provider === "doubao" ||
            parsed.provider === "claude" ||
            parsed.provider === "custom"
              ? parsed.provider
              : DEFAULT_AI_SETTINGS.provider,
          apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
          baseUrl: typeof parsed.baseUrl === "string" ? parsed.baseUrl : "",
          model: typeof parsed.model === "string" ? parsed.model : "",
        });
      } catch {
        // Ignore broken AI settings.
      }
    }
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated || !challenge) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(challenge));
  }, [challenge, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    window.localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(aiSettings));
  }, [aiSettings, isHydrated]);

  const progress = useMemo(
    () => (clientToday ? getYearProgress(clientToday) : { percent: 0, block: 1 }),
    [clientToday],
  );
  const currentDayIndex = useMemo(
    () => (challenge && clientToday ? getCurrentCycleDayIndex(challenge, clientToday) : 0),
    [challenge, clientToday],
  );
  const safeSelectedDayIndex = Math.min(selectedDayIndex, currentDayIndex);
  useEffect(() => {
    if (selectedDayIndex > currentDayIndex) {
      setSelectedDayIndex(currentDayIndex);
    }
  }, [currentDayIndex, selectedDayIndex]);
  const currentDayDisplay = currentDayIndex + 1;
  const completedDays = useMemo(
    () => challenge?.entries.filter((entry) => entry.completed === true).length ?? 0,
    [challenge],
  );

  const goalStats = useMemo(
    () =>
      challenge?.goals.map((goal, goalIndex) => ({
        ...goal,
        completionCount: challenge.entries.filter((entry) =>
          entry.completedGoalIndexes.includes(goalIndex),
        ).length,
      })) ?? [],
    [challenge],
  );

  function saveToday(completed: boolean) {
    if (!challenge) return;
    const todayEntry = challenge.entries[safeSelectedDayIndex];
    const goalCount = challenge.goals.length;
    if (completed && goalCount >= 2 && todayEntry.completedGoalIndexes.length === 0) {
      return;
    }
    const nextCompletedGoals =
      goalCount === 1
        ? completed
          ? [0]
          : []
        : completed
          ? todayEntry.completedGoalIndexes
          : [];
    const nextEntries = challenge.entries.map((entry) =>
      entry.dayIndex === safeSelectedDayIndex
        ? {
            ...entry,
            completed,
            mood: todayEntry.mood,
            note: todayEntry.note.trim(),
            completedGoalIndexes: nextCompletedGoals,
          }
        : entry,
    );
    setChallenge({ ...challenge, entries: nextEntries });
  }

  function updateGoalTitle(goalIndex: number, title: string) {
    if (!challenge) return;
    const nextGoals = challenge.goals.map((goal, index) =>
      index === goalIndex ? { ...goal, title } : goal,
    );
    setChallenge({ ...challenge, goals: nextGoals });
  }

  function updateGoalType(goalIndex: number, type: GoalType) {
    if (!challenge) return;
    const nextGoals = challenge.goals.map((goal, index) =>
      index === goalIndex ? { ...goal, type } : goal,
    );
    setChallenge({ ...challenge, goals: nextGoals });
  }

  function addGoal() {
    if (!challenge) return;
    if (challenge.goals.length >= 3) return;
    const nextGoals = [
      ...challenge.goals,
      { title: `目标 ${challenge.goals.length + 1}`, type: "custom" as GoalType },
    ];
    setChallenge({ ...challenge, goals: nextGoals });
  }

  function deleteGoal(goalIndex: number) {
    if (!challenge) return;
    if (challenge.goals.length <= 1) return;
    const nextGoals = challenge.goals.filter((_, index) => index !== goalIndex);
    const nextEntries = challenge.entries.map((entry) => ({
      ...entry,
      completedGoalIndexes: entry.completedGoalIndexes
        .filter((index) => index !== goalIndex)
        .map((index) => (index > goalIndex ? index - 1 : index)),
    }));
    setChallenge({ ...challenge, goals: nextGoals, entries: nextEntries });
  }

  async function handleImageUpload(file: File | null) {
    if (!challenge || !file) return;
    try {
      const imageDataUrl = await compressImageToDataUrl(file);
      const nextEntries = challenge.entries.map((entry) =>
        entry.dayIndex === safeSelectedDayIndex ? { ...entry, imageDataUrl } : entry,
      );
      setChallenge({ ...challenge, entries: nextEntries });
      setImageError("");
    } catch {
      setImageError("图片太大或处理失败，请重新选择图片");
    }
  }

  function removeTodayImage() {
    if (!challenge) return;
    const nextEntries = challenge.entries.map((entry) =>
      entry.dayIndex === safeSelectedDayIndex ? { ...entry, imageDataUrl: "" } : entry,
    );
    setChallenge({ ...challenge, entries: nextEntries });
    setImageError("");
  }

  function startEditChallengeName() {
    if (!challenge) return;
    setEditingName(challenge.name);
    setIsEditingName(true);
  }

  function submitChallengeName() {
    if (!challenge) return;
    const nextName = editingName.trim();
    if (!nextName) {
      setIsEditingName(false);
      return;
    }
    setChallenge({ ...challenge, name: nextName });
    setIsEditingName(false);
  }

  if (!isHydrated || !clientToday || !challenge) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,#f4f4f5_0%,#fafafa_38%,#f8fafc_100%)] px-4 py-4 text-zinc-900">
        <div className="mx-auto w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500 shadow-[0_10px_30px_-20px_rgba(24,24,27,0.35)]">
          正在加载挑战数据...
        </div>
      </main>
    );
  }

  const todayEntry = challenge.entries[safeSelectedDayIndex];
  const primaryGoalType = challenge.goals[0]?.type;
  const isSingleGoal = challenge.goals.length === 1;
  const canCompleteToday = isSingleGoal || todayEntry.completedGoalIndexes.length > 0;
  const shouldShowReviewCard =
    currentDayDisplay === 10 || challenge.entries.every((entry) => entry.completed !== null);
  const moodStats = challenge.entries.reduce(
    (acc, entry) => {
      if (entry.mood === "hard") acc.hard += 1;
      if (entry.mood === "okay") acc.okay += 1;
      if (entry.mood === "great") acc.great += 1;
      return acc;
    },
    { hard: 0, okay: 0, great: 0 },
  );

  function restartWithSameGoals() {
    if (!challenge || !clientToday) return;
    setChallenge(startNewCycleWithGoals(challenge.goals, clientToday));
    setSelectedDayIndex(0);
  }

  function createFreshChallenge() {
    if (!clientToday) return;
    setChallenge(createDefaultChallenge(clientToday));
    setSelectedDayIndex(0);
  }

  async function handleGenerateAiReview() {
    if (!challenge) return;
    if (!aiSettings.apiKey.trim()) {
      setAiReviewError("请先在下方填写你的 AI 配置");
      return;
    }
    if (
      aiSettings.provider !== "openai" &&
      aiSettings.provider !== "custom" &&
      aiSettings.provider !== "claude"
    ) {
      setAiReviewError("当前版本先支持 OpenAI / Claude / Custom 配置");
      return;
    }
    setIsGeneratingAiReview(true);
    setAiReviewError("");
    try {
      const prompt = buildPromptFromChallengeData(challenge, completedDays, moodStats, goalStats);
      const text = await generateAiReview(aiSettings, prompt);
      setAiReviewText(text);
    } catch {
      setAiReviewError("AI 总结生成失败，请检查配置后重试");
    } finally {
      setIsGeneratingAiReview(false);
    }
  }

  function getShareFileName() {
    const date = formatDate(clientToday ?? new Date()).replaceAll("/", "-");
    return `tenday-share-${date}.png`;
  }

  function downloadImage(dataUrl: string) {
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = getShareFileName();
    link.click();
  }

  async function generateShareCard() {
    if (!shareCardRef.current) return;
    setIsGeneratingShare(true);
    setShareError("");
    try {
      const dataUrl = await toPng(shareCardRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: "#f8fafc",
      });
      setShareImageUrl(dataUrl);
      downloadImage(dataUrl);
    } catch {
      setShareError("分享图生成失败，请稍后再试");
    } finally {
      setIsGeneratingShare(false);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(120%_80%_at_50%_0%,#f1f5f9_0%,#f8fafc_44%,#fafafa_100%)] px-4 py-5 text-zinc-900">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 pb-14">
        <section className="rounded-[24px] border border-slate-200/60 bg-gradient-to-b from-white to-slate-50/60 px-5 py-4 shadow-[0_12px_24px_-20px_rgba(15,23,42,0.42)]">
          <h1 className="text-[28px] font-semibold tracking-tight text-slate-950">TenDay</h1>
          <p className="mt-1 text-sm text-slate-500">把一年拆成36个小周期</p>
        </section>
        <section className="relative rounded-[30px] border border-slate-200/60 bg-gradient-to-br from-white via-slate-50 to-indigo-50/60 p-5 shadow-[0_16px_36px_-24px_rgba(30,41,59,0.5)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_20px_40px_-26px_rgba(30,41,59,0.56)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] tracking-[0.18em] text-slate-400">今天</p>
              <h1 className="mt-1 text-sm font-semibold tracking-tight text-slate-800">
                {formatDate(clientToday)}
              </h1>
            </div>
            <div className="rounded-xl border border-indigo-200/60 bg-white/90 px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm">
              第 {progress.block} / 36 个10天
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="text-slate-400">年度进度</span>
            <span className="font-semibold text-slate-800">{progress.percent}%</span>
          </div>
          <div className="relative mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200/70">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-slate-700 to-slate-900 transition-all duration-500 ease-out"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-400">已走到第 {progress.block} / 36 个10天</p>
        </section>

        <section className="rounded-[30px] border border-slate-200/60 bg-gradient-to-b from-white to-slate-50/70 p-5 shadow-[0_16px_32px_-24px_rgba(15,23,42,0.48)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_20px_36px_-26px_rgba(15,23,42,0.55)]">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] tracking-[0.16em] text-slate-400">本轮计划</p>
              {isEditingName ? (
                <div className="mt-1 flex items-center gap-2">
                  <input
                    value={editingName}
                    onChange={(event) => setEditingName(event.target.value)}
                    onBlur={submitChallengeName}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") submitChallengeName();
                    }}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                    autoFocus
                  />
                </div>
              ) : (
                <h2 className="mt-1 truncate text-lg font-semibold tracking-tight text-slate-950">
                  {challenge.name}
                </h2>
              )}
            </div>
            {!isEditingName && (
              <button
                type="button"
                onClick={startEditChallengeName}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm active:translate-y-0"
              >
                编辑
              </button>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-400">
            {formatDate(challenge.startDate)} - {formatDate(challenge.endDate)}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs">
            <div className="rounded-xl border border-slate-200/70 bg-white/80 p-2.5">
              <p className="text-slate-400">当前天数</p>
              <p className="mt-0.5 font-semibold text-slate-800">第 {currentDayDisplay} / 10 天</p>
            </div>
            <div className="rounded-xl border border-slate-200/70 bg-white/80 p-2.5">
              <p className="text-slate-400">完成天数</p>
              <p className="mt-0.5 font-semibold text-slate-800">{completedDays} 天</p>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-slate-200/60 bg-gradient-to-b from-white to-slate-50/40 p-5 shadow-[0_14px_30px_-24px_rgba(15,23,42,0.44)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_34px_-26px_rgba(15,23,42,0.5)]">
          <h3 className="text-sm font-semibold text-slate-900">周期进度</h3>
          <p className="mt-1 text-xs text-slate-400">一眼看清本轮节奏，深色=完成今日，浅灰=今天跳过，白色=待记录。</p>
          <div className="mt-2.5 grid grid-cols-10 gap-1">
            {challenge.entries.map((entry) => {
              const isCurrent = entry.dayIndex === currentDayIndex;
              return (
                <button
                  type="button"
                  onClick={() => {
                    if (entry.dayIndex <= currentDayIndex) {
                      setSelectedDayIndex(entry.dayIndex);
                    }
                  }}
                  key={entry.dayIndex}
                  disabled={entry.dayIndex > currentDayIndex}
                  className={`relative flex h-6 w-full items-center justify-center rounded-md border transition-all duration-200 active:scale-[0.98] ${getDayStateClass(entry)} ${
                    isCurrent
                      ? "ring-2 ring-indigo-500/90 ring-offset-1 ring-offset-slate-50 shadow-[0_0_0_3px_rgba(99,102,241,0.12)]"
                      : ""
                  } ${entry.dayIndex === safeSelectedDayIndex ? "ring-2 ring-slate-400/90 ring-offset-1 ring-offset-slate-50" : ""} ${
                    entry.dayIndex > currentDayIndex ? "cursor-not-allowed opacity-45" : "cursor-pointer"
                  }`}
                  title={`第${entry.dayIndex + 1}天`}
                >
                  <div
                    className={`absolute left-1 top-1 h-0.5 w-1.5 rounded-full ${
                      isCurrent ? "bg-indigo-500/80" : "bg-transparent"
                    }`}
                  />
                  <div
                    className={`h-1.5 w-1.5 rounded-full ring-1 ring-white/70 ${getMoodDotClass(entry.mood)}`}
                    title={entry.mood ?? "unrecorded"}
                  />
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-slate-400">
            橙色=有点难，蓝色=还可以，绿色=状态好。
          </p>
        </section>

        <section className="rounded-[28px] border border-slate-200/60 bg-gradient-to-b from-white to-slate-50/40 p-5 shadow-[0_14px_30px_-24px_rgba(15,23,42,0.44)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_34px_-26px_rgba(15,23,42,0.5)]">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-900">本轮目标 ({challenge.goals.length}/3)</h3>
            {challenge.goals.length < 3 && (
              <button
                type="button"
                onClick={addGoal}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700 transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm active:scale-[0.98]"
              >
                新增目标
              </button>
            )}
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {goalStats.map((goal, goalIndex) => (
              <div
                key={`goal-${goalIndex}`}
                className="rounded-2xl border border-slate-200/70 bg-gradient-to-b from-white to-slate-50/70 p-3.5 transition-all duration-200 hover:border-slate-300 hover:shadow-sm"
              >
                <div className="flex items-start gap-2">
                  <input
                    value={goal.title}
                    onChange={(event) => updateGoalTitle(goalIndex, event.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  />
                  <button
                    type="button"
                    onClick={() => deleteGoal(goalIndex)}
                    disabled={challenge.goals.length <= 1}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-500 transition-all duration-200 hover:border-rose-200 hover:text-rose-500 hover:shadow-sm active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    删除
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <select
                    value={goal.type}
                    onChange={(event) => {
                      if (isValidGoalType(event.target.value)) {
                        updateGoalType(goalIndex, event.target.value);
                      }
                    }}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  >
                    {GOAL_TYPE_OPTIONS.map((type) => (
                      <option key={type} value={type}>
                        {GOAL_TYPE_ZH[type]}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-slate-400">{goal.completionCount} 次完成</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[30px] border border-indigo-100/80 bg-gradient-to-b from-white via-slate-50/50 to-indigo-50/40 p-5 shadow-[0_18px_34px_-26px_rgba(30,41,59,0.5)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_38px_-26px_rgba(30,41,59,0.56)]">
          <h3 className="text-sm font-semibold text-slate-900">今日进展</h3>
          {safeSelectedDayIndex < currentDayIndex && (
            <p className="mt-1 text-xs text-slate-400">正在补记录：第 {safeSelectedDayIndex + 1} 天</p>
          )}
          <p className="mt-1 text-xs text-slate-400">先记录状态，再决定今天是否算完成。</p>

          <p className="mt-3 text-xs text-slate-400">今天的状态如何？</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {(["hard", "okay", "great"] as Mood[]).map((mood) => (
              <button
                key={mood}
                type="button"
                onClick={() => {
                  const nextEntries = challenge.entries.map((entry) =>
                    entry.dayIndex === safeSelectedDayIndex ? { ...entry, mood } : entry,
                  );
                  setChallenge({ ...challenge, entries: nextEntries });
                }}
                className={`rounded-xl px-3 py-2.5 text-sm capitalize transition-all duration-200 active:scale-[0.98] ${
                  todayEntry.mood === mood
                    ? `${MOOD_STYLE[mood]} scale-[1.02] shadow-sm`
                    : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                {mood === "hard" ? "有点难" : mood === "okay" ? "还可以" : "状态好"}
              </button>
            ))}
          </div>

          {challenge.goals.length >= 2 && (
            <div className="mt-4">
              <p className="text-xs text-slate-400">今天完成了哪些目标？</p>
              <div className="mt-2 flex flex-col gap-2">
                {challenge.goals.map((goal, goalIndex) => (
                  <label
                    key={`${goal.title}-${goalIndex}`}
                    className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm transition-all duration-200 hover:border-slate-300 active:scale-[0.995]"
                  >
                    <input
                      type="checkbox"
                      checked={todayEntry.completedGoalIndexes.includes(goalIndex)}
                      onChange={() => {
                        const nextSelected = todayEntry.completedGoalIndexes.includes(goalIndex)
                          ? todayEntry.completedGoalIndexes.filter((index) => index !== goalIndex)
                          : [...todayEntry.completedGoalIndexes, goalIndex];
                        const nextEntries = challenge.entries.map((entry) =>
                          entry.dayIndex === safeSelectedDayIndex
                            ? { ...entry, completedGoalIndexes: nextSelected }
                            : entry,
                        );
                        setChallenge({ ...challenge, entries: nextEntries });
                      }}
                      className="h-4 w-4 accent-indigo-500"
                    />
                    <span className="flex-1">{goal.title}</span>
                    <span className="text-xs text-slate-500">{GOAL_TYPE_ZH[goal.type]}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4">
            <div className="flex items-center justify-between">
              <label className="text-xs text-slate-400">今日图片（可选）</label>
              {todayEntry.imageDataUrl && (
                <button
                  type="button"
                  onClick={removeTodayImage}
                className="text-xs text-slate-500 transition-all duration-200 hover:text-rose-500 active:scale-[0.98]"
                >
                  删除图片
                </button>
              )}
            </div>
            <label className="mt-2 block cursor-pointer rounded-2xl border border-dashed border-slate-300 bg-white/85 p-3 text-center text-xs text-slate-500 transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-indigo-50/50 hover:shadow-sm active:translate-y-0">
              {todayEntry.imageDataUrl ? "更换图片" : "上传今天的一张图片"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  void handleImageUpload(event.target.files?.[0] ?? null);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            {imageError && <p className="mt-2 text-xs text-rose-500">{imageError}</p>}
            {todayEntry.imageDataUrl && (
              <NextImage
                src={todayEntry.imageDataUrl}
                alt="今日记录图片"
                width={320}
                height={96}
                unoptimized
                className="mt-2 h-24 w-full rounded-xl border border-slate-200 object-cover"
              />
            )}
          </div>

          <label className="mt-4 block text-xs text-slate-400">记录一下今天（可选）</label>
          <textarea
            className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-white p-3 text-sm outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
            rows={3}
            value={todayEntry.note}
            onChange={(event) => {
              const nextEntries = challenge.entries.map((entry) =>
                entry.dayIndex === safeSelectedDayIndex ? { ...entry, note: event.target.value } : entry,
              );
              setChallenge({ ...challenge, entries: nextEntries });
            }}
            placeholder="写点什么，记录一下今天"
          />

          {todayEntry?.mood && (
            <p className="mt-2 text-xs text-slate-400">
              今天已记录状态：
              <span className="ml-1 font-medium">
                {todayEntry.mood === "hard"
                  ? "有点难"
                  : todayEntry.mood === "okay"
                    ? "还可以"
                    : "状态好"}
              </span>
            </p>
          )}

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => saveToday(true)}
              disabled={!canCompleteToday}
              className="rounded-2xl bg-slate-900 px-3 py-3 text-sm font-medium text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-md active:scale-[0.98] active:translate-y-0 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isSingleGoal ? getCompletedActionCopy(primaryGoalType) : "完成今日"}
            </button>
            <button
              type="button"
              onClick={() => saveToday(false)}
              className="rounded-2xl border border-slate-300 bg-white px-3 py-3 text-sm font-medium text-slate-700 transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-sm active:scale-[0.98] active:translate-y-0"
            >
              今天跳过
            </button>
          </div>
        </section>

        {shouldShowReviewCard && (
          <section className="rounded-[28px] border border-slate-200/60 bg-gradient-to-b from-white to-slate-50 p-5 shadow-[0_14px_30px_-24px_rgba(15,23,42,0.44)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_34px_-26px_rgba(15,23,42,0.5)]">
            <h3 className="text-sm font-semibold text-slate-900">周期回顾</h3>
            <p className="mt-1 text-xs text-slate-400">用 30 秒看清这 10 天，再决定下一步。</p>
            <p className="mt-3 text-sm text-slate-700">本轮已完成 {completedDays} / 10 天</p>
            <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
              <p>情绪分布：</p>
              <p className="mt-1">有点难 {moodStats.hard} 天</p>
              <p>还可以 {moodStats.okay} 天</p>
              <p>状态好 {moodStats.great} 天</p>
            </div>
            <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
              {goalStats.map((goal) => (
                <p key={`${goal.title}-${goal.type}`}>{goal.title}：{goal.completionCount} 次</p>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={restartWithSameGoals}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-sm active:scale-[0.98]"
              >
                继续下一轮
              </button>
              <button
                type="button"
                onClick={createFreshChallenge}
                className="rounded-xl bg-slate-900 px-3 py-2.5 text-sm text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-700 hover:shadow-sm active:scale-[0.98]"
              >
                开启新计划
              </button>
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={handleGenerateAiReview}
                disabled={isGeneratingAiReview}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-sm active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isGeneratingAiReview ? "AI正在总结这10天..." : "AI总结这10天"}
              </button>
              {aiReviewError && <p className="text-xs text-rose-500">{aiReviewError}</p>}
              {aiReviewText && (
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 text-sm leading-6 text-slate-700">
                  {aiReviewText}
                </div>
              )}
              <button
                type="button"
                onClick={generateShareCard}
                disabled={isGeneratingShare}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-sm active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isGeneratingShare ? "正在生成分享图..." : "生成分享图"}
              </button>
              {shareImageUrl && !isGeneratingShare && (
                <button
                  type="button"
                  onClick={() => downloadImage(shareImageUrl)}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-600 transition-all duration-200 hover:bg-slate-50 active:scale-[0.98]"
                >
                  下载图片
                </button>
              )}
              {shareError && <p className="text-xs text-rose-500">{shareError}</p>}
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-[0_8px_20px_-16px_rgba(15,23,42,0.35)] transition-all duration-200">
          <button
            type="button"
            onClick={() => setShowAiSettings((prev) => !prev)}
            className="flex w-full items-center justify-between text-left text-xs text-slate-500 transition-all duration-200 hover:text-slate-700 active:scale-[0.98]"
          >
            <span>AI 高级设置</span>
            <span>{showAiSettings ? "收起" : "展开"}</span>
          </button>
          {showAiSettings && (
            <div className="mt-3 space-y-2">
              <div>
                <label className="text-xs text-slate-400">Provider</label>
                <select
                  value={aiSettings.provider}
                  onChange={(event) =>
                    setAiSettings({ ...aiSettings, provider: event.target.value as AiProvider })
                  }
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-700 outline-none focus:border-indigo-300"
                >
                  <option value="openai">OpenAI</option>
                  <option value="doubao">豆包</option>
                  <option value="claude">Claude</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400">API Key</label>
                <input
                  type="password"
                  value={aiSettings.apiKey}
                  onChange={(event) => setAiSettings({ ...aiSettings, apiKey: event.target.value })}
                  placeholder="请输入你的 API Key"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-700 outline-none focus:border-indigo-300"
                />
              </div>
              {(aiSettings.provider === "custom" || aiSettings.provider === "doubao") && (
                <div>
                  <label className="text-xs text-slate-400">Base URL（可选）</label>
                  <input
                    value={aiSettings.baseUrl}
                    onChange={(event) => setAiSettings({ ...aiSettings, baseUrl: event.target.value })}
                    placeholder="https://api.example.com/v1"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-700 outline-none focus:border-indigo-300"
                  />
                </div>
              )}
              <div>
                <label className="text-xs text-slate-400">Model（可选）</label>
                <input
                  value={aiSettings.model}
                  onChange={(event) => setAiSettings({ ...aiSettings, model: event.target.value })}
                  placeholder={aiSettings.provider === "claude" ? "claude-3-5-sonnet-latest" : "gpt-4.1-mini"}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-700 outline-none focus:border-indigo-300"
                />
              </div>
              <p className="text-[11px] text-slate-400">AI 配置仅保存在当前浏览器本地，请勿在公共设备输入私钥。</p>
            </div>
          )}
        </section>
      </div>
      <div className="pointer-events-none fixed -left-[9999px] top-0 opacity-0">
        <div
          ref={shareCardRef}
          className="h-[1440px] w-[1080px] bg-[radial-gradient(120%_90%_at_50%_0%,#eef2ff_0%,#f8fafc_45%,#ffffff_100%)] p-16 text-slate-900"
        >
          <div className="h-full rounded-[44px] border border-slate-200/70 bg-white/90 p-14 shadow-[0_28px_60px_-36px_rgba(15,23,42,0.4)]">
            <p className="text-sm tracking-[0.18em] text-slate-400">TenDay</p>
            <h2 className="mt-2 text-5xl font-semibold tracking-tight text-slate-950">把一年拆成36个小周期</h2>
            <div className="mt-12 rounded-3xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-8">
              <p className="text-sm text-slate-400">本轮计划</p>
              <p className="mt-2 text-4xl font-semibold text-slate-950">{challenge.name}</p>
              <p className="mt-3 text-xl text-slate-500">
                {formatDate(challenge.startDate)} - {formatDate(challenge.endDate)}
              </p>
            </div>
            <div className="mt-8 grid grid-cols-2 gap-5">
              <div className="rounded-2xl border border-slate-200 bg-white p-6">
                <p className="text-sm text-slate-400">完成情况</p>
                <p className="mt-2 text-4xl font-semibold text-slate-950">{completedDays} / 10 天</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
                <p className="text-slate-400">情绪分布</p>
                <p className="mt-2">有点难 {moodStats.hard} 天</p>
                <p>还可以 {moodStats.okay} 天</p>
                <p>状态好 {moodStats.great} 天</p>
              </div>
            </div>
            <div className="mt-8 grid grid-cols-10 gap-2">
              {challenge.entries.map((entry) => (
                <div
                  key={`share-${entry.dayIndex}`}
                  className={`h-10 rounded-lg border ${getDayStateClass(entry)} ${
                    entry.dayIndex === currentDayIndex ? "ring-2 ring-indigo-500/80" : ""
                  }`}
                />
              ))}
            </div>
            <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
              <p className="text-slate-400">目标完成</p>
              {goalStats.map((goal) => (
                <p key={`share-goal-${goal.title}-${goal.type}`} className="mt-1">
                  {goal.title}：{goal.completionCount} 次
                </p>
              ))}
            </div>
            <p className="mt-10 text-center text-2xl text-slate-700">
              不用一下改变很多，先完成下一个10天
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
