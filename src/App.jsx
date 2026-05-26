import React, { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  BarChart3,
  Flame,
  Plus,
  Trash2,
  Search,
  NotebookText,
  Library,
  MessageSquareText,
  Target,
  CheckCircle2,
  Circle,
  CalendarDays,
} from "lucide-react";
import "./App.css";

const STORAGE_KEY = "ielts-reading-vocab-tracker-v1";
const GOALS_STORAGE_KEY = "ielts-reading-vocab-goals-v1";
const MISTAKE_REASONS_STORAGE_KEY = "ielts-reading-vocab-mistake-reasons-v1";

const defaultDailyGoals = {
  readings: 1,
  mistakes: 3,
  words: 10,
  sentences: 2,
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const uid = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

const initialData = {
  readings: [],
  mistakes: [],
  words: [],
  wordOccurrences: [],
  sentences: [],
  retakePlans: [],
};

function normalizeData(raw) {
  const source = raw && typeof raw === "object" ? raw : {};

  return {
    readings: Array.isArray(source.readings)
      ? source.readings.map((reading) => ({
          ...reading,
          difficulty: String(reading.difficulty || "3"),
        }))
      : [],
    mistakes: Array.isArray(source.mistakes)
      ? source.mistakes.map((mistake) => ({
          ...mistake,
          category: mistake.category || inferMistakeCategory(mistake.questionType),
          reasonTags: Array.isArray(mistake.reasonTags) ? mistake.reasonTags : [],
        }))
      : [],
    words: Array.isArray(source.words)
      ? source.words.map((word) => ({
          ...word,
          status: word.status || "new",
          reviewCount: clampNumber(word.reviewCount, 0),
          nextReviewDate: word.nextReviewDate || word.createdAt || todayISO(),
        }))
      : [],
    wordOccurrences: Array.isArray(source.wordOccurrences) ? source.wordOccurrences : [],
    sentences: Array.isArray(source.sentences) ? source.sentences : [],
    retakePlans: Array.isArray(source.retakePlans) ? source.retakePlans : [],
  };
}
const mistakeCategoryOptions = ["段落匹配", "多选", "单选", "填空", "判断", "匹配", "其它"];

function inferMistakeCategory(questionType) {
  if (!questionType) return "其它";

  if (questionType.includes("Heading")) return "段落匹配";

  if (
    questionType.includes("True") ||
    questionType.includes("False") ||
    questionType.includes("Not Given") ||
    questionType.includes("Yes") ||
    questionType.includes("No")
  ) {
    return "判断";
  }

  if (questionType.includes("Multiple Choice")) return "单选";

  if (
    questionType.includes("Completion") ||
    questionType.includes("Short Answer") ||
    questionType.includes("Diagram") ||
    questionType.includes("Table") ||
    questionType.includes("Flow")
  ) {
    return "填空";
  }

  if (questionType.includes("Matching")) return "匹配";

  return "其它";
}

function recommendRetakeDate(readingDate, mistakeCount) {
  const baseDate = readingDate || todayISO();
  return dateAdd(baseDate, mistakeCount >= 4 ? 10 : 20);
}

const defaultMistakeReasonOptions = [
  "单词不认识",
  "同义替换没看出来",
  "定位错误",
  "长难句理解错误",
  "题目理解错误",
  "Not Given 判断错误",
  "细节看漏",
  "时间不够",
  "粗心",
  "耐心不足",
];

const questionTypeOptions = [
  "True / False / Not Given",
  "Yes / No / Not Given",
  "Matching Headings",
  "Matching Information",
  "Summary Completion",
  "Sentence Completion",
  "Multiple Choice",
  "Short Answer",
  "Diagram / Table / Flow-chart",
  "Other",
];

const wordStatusOptions = [
  { value: "new", label: "未掌握" },
  { value: "learning", label: "模糊" },
  { value: "mastered", label: "已掌握" },
];

const sentenceTypeOptions = ["长难句", "同义替换", "写作可用句", "其他"];

const difficultyOptions = [
  { value: "1", label: "很简单" },
  { value: "2", label: "偏简单" },
  { value: "3", label: "中等" },
  { value: "4", label: "偏难" },
  { value: "5", label: "很难" },
];

function clampNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function dateAdd(date, days) {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function getLastNDays(n) {
  const end = todayISO();
  const start = dateAdd(end, -(n - 1));
  return Array.from({ length: n }, (_, i) => dateAdd(start, i));
}

function normalizeWord(word) {
  return word.trim().toLowerCase();
}

function Card({ children, className = "" }) {
  return <div className={`card ${className}`}>{children}</div>;
}

function SectionTitle({ icon: Icon, title, subtitle }) {
  return (
    <div className="section-title">
      <div className="section-icon"><Icon size={20} /></div>
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
    </div>
  );
}

function StatCard({ label, value, hint }) {
  return (
    <Card>
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
      {hint && <p className="stat-hint">{hint}</p>}
    </Card>
  );
}

function EmptyState({ text }) {
  return <div className="empty-state">{text}</div>;
}

export default function App() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [data, setData] = useState(initialData);
  const [selectedReadingId, setSelectedReadingId] = useState(null);
  const [searchWord, setSearchWord] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dailyGoals, setDailyGoals] = useState(defaultDailyGoals);
  const [mistakeReasons, setMistakeReasons] = useState(defaultMistakeReasonOptions);
  const [newMistakeReason, setNewMistakeReason] = useState("");
  const [isLoaded, setIsLoaded] = useState(false);

  const [readingForm, setReadingForm] = useState({
    title: "",
    source: "",
    passageNumber: "",
    date: todayISO(),
    timeSpent: "",
    totalQuestions: "13",
    correctCount: "",
    difficulty: "3",
    notes: "",
  });

  const [mistakeForm, setMistakeForm] = useState({
    questionNumber: "",
    questionType: questionTypeOptions[0],
    category: inferMistakeCategory(questionTypeOptions[0]),
    myAnswer: "",
    correctAnswer: "",
    reasonTags: [],
    originalSentence: "",
    reflection: "",
  });

  const [wordForm, setWordForm] = useState({
    word: "",
    meaning: "",
    englishMeaning: "",
    pronunciation: "",
    questionNumber: "",
    sentence: "",
    causedMistake: false,
    note: "",
  });

  const [standaloneWordForm, setStandaloneWordForm] = useState({
    word: "",
    meaning: "",
    englishMeaning: "",
    pronunciation: "",
    notes: "",
  });

  const [sentenceForm, setSentenceForm] = useState({
    content: "",
    type: sentenceTypeOptions[0],
    translation: "",
    topic: "",
    note: "",
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const normalized = normalizeData(parsed);
        setData(normalized);
        setSelectedReadingId(normalized.readings[0]?.id || null);
      }

      const savedGoals = localStorage.getItem(GOALS_STORAGE_KEY);
      if (savedGoals) {
        const parsedGoals = JSON.parse(savedGoals);
        setDailyGoals({ ...defaultDailyGoals, ...(parsedGoals || {}) });
      }

      const savedMistakeReasons = localStorage.getItem(MISTAKE_REASONS_STORAGE_KEY);
      if (savedMistakeReasons) {
        const parsedReasons = JSON.parse(savedMistakeReasons);
        if (Array.isArray(parsedReasons) && parsedReasons.length > 0) {
          setMistakeReasons([...new Set([...defaultMistakeReasonOptions, ...parsedReasons])]);
        }
      }
    } catch (error) {
      console.error("读取本地数据失败", error);
      alert("读取本地保存数据失败。页面会先使用空数据，请先不要录入新内容，建议检查 JSON 备份或浏览器控制台。");
    } finally {
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeData(data)));
  }, [data, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    localStorage.setItem(GOALS_STORAGE_KEY, JSON.stringify(dailyGoals));
  }, [dailyGoals, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    localStorage.setItem(MISTAKE_REASONS_STORAGE_KEY, JSON.stringify(mistakeReasons));
  }, [mistakeReasons, isLoaded]);

  const selectedReading = useMemo(
    () => data.readings.find((reading) => reading.id === selectedReadingId) || null,
    [data.readings, selectedReadingId]
  );

  const stats = useMemo(() => buildStats(data), [data]);

  function createReading(e) {
    e.preventDefault();
    if (!readingForm.title.trim()) return;

    const totalQuestions = clampNumber(readingForm.totalQuestions, 0);
    const correctCount = Math.min(clampNumber(readingForm.correctCount, 0), totalQuestions || 999);

    const reading = {
      id: uid("r"),
      title: readingForm.title.trim(),
      source: readingForm.source.trim(),
      passageNumber: readingForm.passageNumber.trim(),
      date: readingForm.date || todayISO(),
      timeSpent: clampNumber(readingForm.timeSpent, 0),
      totalQuestions,
      correctCount,
      difficulty: readingForm.difficulty || "3",
      notes: readingForm.notes.trim(),
      createdAt: todayISO(),
    };

    setData((prev) => ({ ...prev, readings: [reading, ...prev.readings] }));
    setSelectedReadingId(reading.id);
    setReadingForm({
      title: "",
      source: "",
      passageNumber: "",
      date: todayISO(),
      timeSpent: "",
      totalQuestions: "13",
      correctCount: "",
      difficulty: "3",
      notes: "",
    });
  }

  function updateReading(readingId, updatedFields) {
    setData((prev) => ({
      ...prev,
      readings: prev.readings.map((reading) =>
        reading.id === readingId
          ? { ...reading, ...updatedFields, updatedAt: todayISO() }
          : reading
      ),
    }));
  }

  function deleteReading(id) {
    const occurrenceWordIds = data.wordOccurrences
      .filter((item) => item.readingId === id)
      .map((item) => item.wordId);

    setData((prev) => {
      const nextOccurrences = prev.wordOccurrences.filter((item) => item.readingId !== id);
      const wordIdsStillUsed = new Set(nextOccurrences.map((item) => item.wordId));
      const nextWords = prev.words.filter((word) => !occurrenceWordIds.includes(word.id) || wordIdsStillUsed.has(word.id));

      return {
        readings: prev.readings.filter((item) => item.id !== id),
        mistakes: prev.mistakes.filter((item) => item.readingId !== id),
        words: nextWords,
        wordOccurrences: nextOccurrences,
        sentences: prev.sentences.filter((item) => item.readingId !== id),
        retakePlans: (prev.retakePlans || []).filter((item) => item.readingId !== id),
      };
    });

    if (selectedReadingId === id) {
      const remaining = data.readings.filter((item) => item.id !== id);
      setSelectedReadingId(remaining[0]?.id || null);
    }
  }

  function createMistake(e) {
    e.preventDefault();
    if (!selectedReadingId || !mistakeForm.questionNumber.trim()) return;

    const mistake = {
      id: uid("m"),
      readingId: selectedReadingId,
      questionNumber: mistakeForm.questionNumber.trim(),
      questionType: mistakeForm.questionType,
      category: mistakeForm.category || inferMistakeCategory(mistakeForm.questionType),
      myAnswer: mistakeForm.myAnswer.trim(),
      correctAnswer: mistakeForm.correctAnswer.trim(),
      reasonTags: mistakeForm.reasonTags,
      originalSentence: mistakeForm.originalSentence.trim(),
      reflection: mistakeForm.reflection.trim(),
      createdAt: selectedReading?.date || todayISO(),
    };

    setData((prev) => ({ ...prev, mistakes: [mistake, ...prev.mistakes] }));
    setMistakeForm({
      questionNumber: "",
      questionType: questionTypeOptions[0],
      category: inferMistakeCategory(questionTypeOptions[0]),
      myAnswer: "",
      correctAnswer: "",
      reasonTags: [],
      originalSentence: "",
      reflection: "",
    });
  }

  function toggleReason(reason) {
    setMistakeForm((prev) => ({
      ...prev,
      reasonTags: prev.reasonTags.includes(reason)
        ? prev.reasonTags.filter((item) => item !== reason)
        : [...prev.reasonTags, reason],
    }));
  }

  function addMistakeReason() {
    const reason = newMistakeReason.trim();
    if (!reason) return;
    if (mistakeReasons.includes(reason)) {
      setNewMistakeReason("");
      return;
    }
    setMistakeReasons((prev) => [...prev, reason]);
    setNewMistakeReason("");
  }

  function deleteMistakeReason(reason) {
    const confirmed = window.confirm(`确定要删除错误原因“${reason}”吗？旧错题中已经保存的标签不会被删除。`);
    if (!confirmed) return;
    setMistakeReasons((prev) => prev.filter((item) => item !== reason));
    setMistakeForm((prev) => ({
      ...prev,
      reasonTags: prev.reasonTags.filter((item) => item !== reason),
    }));
  }

  function resetMistakeReasons() {
    const confirmed = window.confirm("确定要恢复默认错误原因吗？这会覆盖你当前自定义的错误原因列表，但不会删除旧错题里已经保存的标签。");
    if (!confirmed) return;
    setMistakeReasons(defaultMistakeReasonOptions);
    setNewMistakeReason("");
  }

  function createWordOccurrence(e) {
    e.preventDefault();
    if (!selectedReadingId || !wordForm.word.trim()) return;

    const normalized = normalizeWord(wordForm.word);
    const existingWord = data.words.find((item) => normalizeWord(item.word) === normalized);

    let wordId = existingWord?.id;
    const newWord = !existingWord
      ? {
          id: uid("w"),
          word: wordForm.word.trim(),
          meaning: wordForm.meaning.trim(),
          englishMeaning: wordForm.englishMeaning.trim(),
          pronunciation: wordForm.pronunciation.trim(),
          status: "new",
          reviewCount: 0,
          nextReviewDate: todayISO(),
          notes: "",
          createdAt: todayISO(),
        }
      : null;

    if (newWord) wordId = newWord.id;

    const occurrence = {
      id: uid("o"),
      wordId,
      readingId: selectedReadingId,
      questionNumber: wordForm.questionNumber.trim(),
      sentence: wordForm.sentence.trim(),
      causedMistake: wordForm.causedMistake,
      note: wordForm.note.trim(),
      createdAt: selectedReading?.date || todayISO(),
    };

    setData((prev) => ({
      ...prev,
      words: newWord ? [newWord, ...prev.words] : prev.words,
      wordOccurrences: [occurrence, ...prev.wordOccurrences],
    }));

    setWordForm({
      word: "",
      meaning: "",
      englishMeaning: "",
      pronunciation: "",
      questionNumber: "",
      sentence: "",
      causedMistake: false,
      note: "",
    });
  }

  function createStandaloneWord(e) {
    e.preventDefault();

    const rawWord = standaloneWordForm.word.trim();
    if (!rawWord) return;

    const normalized = normalizeWord(rawWord);
    const existingWord = data.words.find((item) => normalizeWord(item.word) === normalized);

    if (existingWord) {
      alert("这个单词已经在词库里了。你可以在词库列表中查看或继续补充来源。");
      return;
    }

    const newWord = {
      id: uid("w"),
      word: rawWord,
      meaning: standaloneWordForm.meaning.trim(),
      englishMeaning: standaloneWordForm.englishMeaning.trim(),
      pronunciation: standaloneWordForm.pronunciation.trim(),
      status: "new",
      reviewCount: 0,
      nextReviewDate: todayISO(),
      notes: standaloneWordForm.notes.trim(),
      createdAt: todayISO(),
    };

    setData((prev) => ({
      ...prev,
      words: [newWord, ...prev.words],
    }));

    setStandaloneWordForm({
      word: "",
      meaning: "",
      englishMeaning: "",
      pronunciation: "",
      notes: "",
    });
  }

  function updateWordStatus(wordId, status) {
    setData((prev) => ({
      ...prev,
      words: prev.words.map((word) => (word.id === wordId ? { ...word, status } : word)),
    }));
  }

  function updateWordReview(wordId, result) {
  setData((prev) => ({
    ...prev,
    words: prev.words.map((word) => {
      if (word.id !== wordId) return word;

      if (result === "remember") {
        const nextCount = Math.min((word.reviewCount || 0) + 1, 5);
        const intervals = [1, 2, 4, 7, 15];
        const days = intervals[Math.max(nextCount - 1, 0)] || 31;

        return {
          ...word,
          reviewCount: nextCount,
          status: nextCount >= 5 ? "mastered" : "learning",
          nextReviewDate: addDays(todayISO(), days),
        };
      }

      if (result === "fuzzy") {
        return {
          ...word,
          status: "learning",
          nextReviewDate: addDays(todayISO(), 1),
        };
      }

      if (result === "forgot") {
        return {
          ...word,
          reviewCount: Math.max((word.reviewCount || 0) - 1, 0),
          status: "new",
          nextReviewDate: addDays(todayISO(), 1),
        };
      }

      return word;
    }),
  }));
}

  function deleteWord(wordId) {
    setData((prev) => ({
      ...prev,
      words: prev.words.filter((item) => item.id !== wordId),
      wordOccurrences: prev.wordOccurrences.filter((item) => item.wordId !== wordId),
    }));
  }

  function saveRetakePlan(readingId, plan) {
    setData((prev) => {
      const retakePlans = prev.retakePlans || [];
      const existing = retakePlans.find((item) => item.readingId === readingId);
      const nextPlan = {
        id: existing?.id || uid("rp"),
        readingId,
        needRetake: plan.needRetake,
        retakeDate: plan.retakeDate,
        reason: plan.reason || "",
        completed: existing?.completed || false,
        createdAt: existing?.createdAt || todayISO(),
        updatedAt: todayISO(),
      };

      return {
        ...prev,
        retakePlans: existing
          ? retakePlans.map((item) => (item.readingId === readingId ? nextPlan : item))
          : [nextPlan, ...retakePlans],
      };
    });
  }

  function toggleRetakeCompleted(planId) {
    setData((prev) => ({
      ...prev,
      retakePlans: (prev.retakePlans || []).map((plan) =>
        plan.id === planId ? { ...plan, completed: !plan.completed, updatedAt: todayISO() } : plan
      ),
    }));
  }

  function createSentence(e) {
    e.preventDefault();
    if (!selectedReadingId || !sentenceForm.content.trim()) return;

    const sentence = {
      id: uid("s"),
      readingId: selectedReadingId,
      content: sentenceForm.content.trim(),
      type: sentenceForm.type,
      translation: sentenceForm.translation.trim(),
      topic: sentenceForm.topic.trim(),
      note: sentenceForm.note.trim(),
      createdAt: selectedReading?.date || todayISO(),
    };

    setData((prev) => ({ ...prev, sentences: [sentence, ...prev.sentences] }));
    setSentenceForm({ content: "", type: sentenceTypeOptions[0], translation: "", topic: "", note: "" });
  }

  function deleteItem(collection, id) {
    setData((prev) => ({ ...prev, [collection]: prev[collection].filter((item) => item.id !== id) }));
  }

  function exportBackup() {
    const backup = {
      app: "ielts-reading-vocab-tracker",
      version: 1,
      exportedAt: new Date().toISOString(),
      data,
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ielts-reading-backup-${todayISO()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function importBackup(file) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        const importedData = parsed.data || parsed;

        const safeData = {
          readings: Array.isArray(importedData.readings) ? importedData.readings : [],
          mistakes: Array.isArray(importedData.mistakes) ? importedData.mistakes : [],
          words: Array.isArray(importedData.words) ? importedData.words : [],
          wordOccurrences: Array.isArray(importedData.wordOccurrences) ? importedData.wordOccurrences : [],
          sentences: Array.isArray(importedData.sentences) ? importedData.sentences : [],
        };

        const confirmed = window.confirm(
          "导入备份会覆盖当前本地数据。建议先导出当前数据作为备份。确定继续吗？"
        );
        if (!confirmed) return;

        setData(safeData);
        setSelectedReadingId(safeData.readings[0]?.id || null);
        alert("备份导入成功。");
      } catch (error) {
        console.error("导入备份失败", error);
        alert("导入失败：请选择有效的 JSON 备份文件。");
      }
    };
    reader.readAsText(file);
  }

  function clearAllData() {
    const confirmed = window.confirm("确定要清空全部数据吗？这个操作不能撤销。建议先导出备份。");
    if (!confirmed) return;
    setData(initialData);
    setSelectedReadingId(null);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(GOALS_STORAGE_KEY);
    localStorage.removeItem(MISTAKE_REASONS_STORAGE_KEY);
  }

  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: BarChart3 },
    { id: "readings", label: "Readings", icon: BookOpen },
    { id: "vocabulary", label: "Vocabulary", icon: Library },
    { id: "sentences", label: "Sentences", icon: MessageSquareText },
  ];

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-inner">
          <div className="brand">
            <div className="brand-icon"><NotebookText size={22} /></div>
            <div>
              <h1>雅思阅读复盘本</h1>
              <p>错题、生词、来源和练习热力图都放在一起。</p>
            </div>
          </div>
          <nav className="tab-nav">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`tab-button ${activeTab === tab.id ? "active" : ""}`}
                >
                  <Icon size={16} />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="main-container">
        {activeTab === "dashboard" && (
          <Dashboard
            data={data}
            stats={stats}
            exportBackup={exportBackup}
            importBackup={importBackup}
            clearAllData={clearAllData}
            dailyGoals={dailyGoals}
            setDailyGoals={setDailyGoals}
            toggleRetakeCompleted={toggleRetakeCompleted}
          />
        )}
        {activeTab === "readings" && (
          <ReadingsPage
            data={data}
            selectedReadingId={selectedReadingId}
            selectedReading={selectedReading}
            setSelectedReadingId={setSelectedReadingId}
            readingForm={readingForm}
            setReadingForm={setReadingForm}
            createReading={createReading}
            updateReading={updateReading}
            deleteReading={deleteReading}
            mistakeForm={mistakeForm}
            setMistakeForm={setMistakeForm}
            toggleReason={toggleReason}
            createMistake={createMistake}
            wordForm={wordForm}
            setWordForm={setWordForm}
            createWordOccurrence={createWordOccurrence}
            sentenceForm={sentenceForm}
            setSentenceForm={setSentenceForm}
            createSentence={createSentence}
            deleteItem={deleteItem}
            saveRetakePlan={saveRetakePlan}
            mistakeReasons={mistakeReasons}
            newMistakeReason={newMistakeReason}
            setNewMistakeReason={setNewMistakeReason}
            addMistakeReason={addMistakeReason}
            deleteMistakeReason={deleteMistakeReason}
            resetMistakeReasons={resetMistakeReasons}
          />
        )}
        {activeTab === "vocabulary" && (
          <VocabularyPage
            data={data}
            searchWord={searchWord}
            setSearchWord={setSearchWord}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            updateWordStatus={updateWordStatus}
            updateWordReview={updateWordReview}
            deleteWord={deleteWord}
            standaloneWordForm={standaloneWordForm}
            setStandaloneWordForm={setStandaloneWordForm}
            createStandaloneWord={createStandaloneWord}
          />
        )}
        {activeTab === "sentences" && <SentencesPage data={data} deleteItem={deleteItem} />}
      </main>
    </div>
  );
}

function buildStats(data) {
  const totalReadings = data.readings.length;
  const totalQuestions = data.readings.reduce((sum, item) => sum + clampNumber(item.totalQuestions), 0);
  const correctQuestions = data.readings.reduce((sum, item) => sum + clampNumber(item.correctCount), 0);
  const averageAccuracy = totalQuestions ? Math.round((correctQuestions / totalQuestions) * 100) : 0;

  const reasonCounts = {};
  data.mistakes.forEach((mistake) => {
    mistake.reasonTags?.forEach((tag) => {
      reasonCounts[tag] = (reasonCounts[tag] || 0) + 1;
    });
  });

  const typeCounts = {};
  data.mistakes.forEach((mistake) => {
    typeCounts[mistake.questionType] = (typeCounts[mistake.questionType] || 0) + 1;
  });

  const heatmap = getHeatmapData(data, 84);
  const streaks = getStreaks(heatmap);
  const today = heatmap[heatmap.length - 1];
  const last7 = heatmap.slice(-7).reduce(
    (acc, day) => ({
      readings: acc.readings + day.readings,
      mistakes: acc.mistakes + day.mistakes,
      words: acc.words + day.words,
      sentences: acc.sentences + day.sentences,
      score: acc.score + day.score,
    }),
    { readings: 0, mistakes: 0, words: 0, sentences: 0, score: 0 }
  );

  return {
    totalReadings,
    averageAccuracy,
    totalMistakes: data.mistakes.length,
    totalWords: data.words.length,
    totalWordOccurrences: data.wordOccurrences.length,
    causedMistakeWords: new Set(data.wordOccurrences.filter((item) => item.causedMistake).map((item) => item.wordId)).size,
    masteredWords: data.words.filter((item) => item.status === "mastered").length,
    learningWords: data.words.filter((item) => item.status !== "mastered").length,
    totalSentences: data.sentences.length,
    reasonCounts,
    typeCounts,
    heatmap,
    streaks,
    today,
    last7,
  };
}

function getHeatmapData(data, days) {
  const dates = getLastNDays(days);
  return dates.map((date) => {
    const readings = data.readings.filter((item) => item.date === date).length;
    const mistakes = data.mistakes.filter((item) => item.createdAt === date).length;
    const words = data.wordOccurrences.filter((item) => item.createdAt === date).length;
    const sentences = data.sentences.filter((item) => item.createdAt === date).length;
    const score = readings * 5 + mistakes * 2 + words + sentences;
    return { date, readings, mistakes, words, sentences, score };
  });
}

function getStreaks(heatmap) {
  let current = 0;
  for (let i = heatmap.length - 1; i >= 0; i -= 1) {
    if (heatmap[i].score > 0) current += 1;
    else break;
  }

  let longest = 0;
  let run = 0;
  heatmap.forEach((day) => {
    if (day.score > 0) {
      run += 1;
      longest = Math.max(longest, run);
    } else {
      run = 0;
    }
  });

  return { current, longest };
}

function getHeatLevel(score) {
  if (score <= 0) return "heat-0";
  if (score <= 5) return "heat-1";
  if (score <= 12) return "heat-2";
  if (score <= 20) return "heat-3";
  return "heat-4";
}

function Dashboard({ stats, exportBackup, importBackup, clearAllData, dailyGoals, setDailyGoals }) {
  const topReasons = Object.entries(stats.reasonCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const topTypes = Object.entries(stats.typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);

  const todayGoals = [
    {
      key: "readings",
      label: "完成阅读",
      unit: "篇",
      current: stats.today.readings,
      target: dailyGoals.readings,
    },
    {
      key: "mistakes",
      label: "复盘错题",
      unit: "道",
      current: stats.today.mistakes,
      target: dailyGoals.mistakes,
    },
    {
      key: "words",
      label: "新增生词来源",
      unit: "条",
      current: stats.today.words,
      target: dailyGoals.words,
    },
    {
      key: "sentences",
      label: "积累句子",
      unit: "个",
      current: stats.today.sentences,
      target: dailyGoals.sentences,
    },
  ].map((goal) => ({
    ...goal,
    done: goal.target <= 0 ? true : goal.current >= goal.target,
    value: `${goal.current}/${goal.target}`,
  }));

  function updateDailyGoal(key, value) {
    const nextValue = Math.max(0, clampNumber(value, 0));
    setDailyGoals((prev) => ({ ...prev, [key]: nextValue }));
  }

  function resetDailyGoals() {
    setDailyGoals(defaultDailyGoals);
  }

  return (
    <div className="page-stack">
      <Card>
        <SectionTitle icon={NotebookText} title="数据备份" subtitle="本项目的数据保存在浏览器本地。建议定期导出 JSON 备份。" />
        <div className="backup-actions">
          <button type="button" className="primary-button backup-button" onClick={exportBackup}>
            导出 JSON 备份
          </button>
          <label className="secondary-button backup-button">
            导入 JSON 备份
            <input
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                importBackup(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>
          <button type="button" className="danger-button backup-button" onClick={clearAllData}>
            清空全部数据
          </button>
        </div>
      </Card>

      <div className="stats-grid four">
        <StatCard label="阅读总篇数" value={stats.totalReadings} hint="每篇阅读是一条完整复盘记录" />
        <StatCard label="平均正确率" value={`${stats.averageAccuracy}%`} hint="来自所有已录入阅读" />
        <StatCard label="本地词库" value={stats.totalWords} hint={`出现记录 ${stats.totalWordOccurrences} 条`} />
        <StatCard label="连续练习" value={`${stats.streaks.current} 天`} hint={`最长 ${stats.streaks.longest} 天`} />
      </div>

      <div className="dashboard-grid">
        <Card className="wide-card">
          <SectionTitle icon={Flame} title="练习热力图" subtitle="过去 12 周的阅读、错题、生词和句子记录" />
          <div className="heatmap-grid">
            {stats.heatmap.map((day) => (
              <div
                key={day.date}
                title={`${day.date}\n阅读：${day.readings} 篇\n错题：${day.mistakes} 道\n生词来源：${day.words} 条\n句子：${day.sentences} 条\n练习分数：${day.score}`}
                className={`heat-cell ${getHeatLevel(day.score)}`}
              />
            ))}
          </div>
          <div className="heat-legend">
            <span>少</span>
            <div className="legend-cells">
              {[0, 3, 8, 16, 24].map((score) => (
                <span key={score} className={`legend-cell ${getHeatLevel(score)}`} />
              ))}
            </div>
            <span>多</span>
          </div>
          <p className="encourage-text">
            {stats.streaks.current > 0
              ? `你已经连续练习 ${stats.streaks.current} 天了。今天的记录会变成之后很有底气的证据。`
              : "今天还没有练习记录。录入一篇阅读，热力图就会亮起来。"}
          </p>
        </Card>

        <Card>
          <SectionTitle icon={Target} title="今日目标" subtitle="可以按今天的学习安排自己设置" />
          <div className="goal-list">
            {todayGoals.map((goal) => (
              <div key={goal.key} className="goal-item editable-goal-item">
                <div className="goal-left">
                  {goal.done ? <CheckCircle2 size={18} className="icon-success" /> : <Circle size={18} className="icon-muted" />}
                  <span>{goal.label}</span>
                </div>
                <div className="goal-edit-area">
                  <span className="goal-value">{goal.current}/</span>
                  <input
                    type="number"
                    min="0"
                    value={goal.target}
                    onChange={(event) => updateDailyGoal(goal.key, event.target.value)}
                    className="goal-input"
                  />
                  <span className="goal-unit">{goal.unit}</span>
                </div>
              </div>
            ))}
          </div>
          <button type="button" className="secondary-button reset-goals-button" onClick={resetDailyGoals}>
            恢复默认目标
          </button>
        </Card>
      </div>

      <div className="stats-grid three">
        <StatCard label="错题总数" value={stats.totalMistakes} hint="可用于观察错误模式" />
        <StatCard label="未完全掌握词" value={stats.learningWords} hint={`已掌握 ${stats.masteredWords} 个`} />
        <StatCard label="导致错题的词" value={stats.causedMistakeWords} hint="这些词优先复习" />
      </div>

      <div className="two-col-grid">
        <Card>
          <SectionTitle icon={BarChart3} title="错误原因排行" />
          {topReasons.length ? <RankList items={topReasons} /> : <EmptyState text="还没有错题原因。录入错题后这里会自动统计。" />}
        </Card>
        <Card>
          <SectionTitle icon={BookOpen} title="题型错误排行" />
          {topTypes.length ? <RankList items={topTypes} /> : <EmptyState text="还没有题型错误数据。" />}
        </Card>
      </div>

      <Card>
        <SectionTitle icon={CalendarDays} title="最近 7 天" subtitle="看最近一周是否有稳定推进" />
        <div className="stats-grid five">
          <StatCard label="阅读" value={`${stats.last7.readings} 篇`} />
          <StatCard label="错题" value={`${stats.last7.mistakes} 道`} />
          <StatCard label="生词来源" value={`${stats.last7.words} 条`} />
          <StatCard label="句子" value={`${stats.last7.sentences} 条`} />
          <StatCard label="练习分数" value={stats.last7.score} />
        </div>
      </Card>
    </div>
  );
}

function RankList({ items }) {
  const max = Math.max(...items.map(([, value]) => value), 1);
  return (
    <div className="rank-list">
      {items.map(([label, value]) => (
        <div key={label} className="rank-item">
          <div className="rank-row">
            <span>{label}</span>
            <span>{value}</span>
          </div>
          <div className="rank-track">
            <div className="rank-bar" style={{ width: `${(value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ReadingsPage(props) {
  const {
    data,
    selectedReadingId,
    selectedReading,
    setSelectedReadingId,
    readingForm,
    setReadingForm,
    createReading,
    updateReading,
    deleteReading,
    mistakeForm,
    setMistakeForm,
    toggleReason,
    createMistake,
    wordForm,
    setWordForm,
    createWordOccurrence,
    sentenceForm,
    setSentenceForm,
    createSentence,
    deleteItem,
    saveRetakePlan,

    mistakeReasons = defaultMistakeReasonOptions,
    newMistakeReason = "",
    setNewMistakeReason = () => {},
    addMistakeReason = () => {},
    deleteMistakeReason = () => {},
    resetMistakeReasons = () => {},
  } = props;

  const readingMistakes = data.mistakes.filter((item) => item.readingId === selectedReadingId);
  const readingOccurrences = data.wordOccurrences.filter((item) => item.readingId === selectedReadingId);
  const readingSentences = data.sentences.filter((item) => item.readingId === selectedReadingId);
  const [isEditingReading, setIsEditingReading] = useState(false);
  const [editingReadingForm, setEditingReadingForm] = useState(null);

  function startEditReading(reading) {
    setEditingReadingForm({
      title: reading.title || "",
      source: reading.source || "",
      passageNumber: reading.passageNumber || "",
      date: reading.date || todayISO(),
      timeSpent: String(reading.timeSpent ?? ""),
      totalQuestions: String(reading.totalQuestions ?? 13),
      correctCount: String(reading.correctCount ?? ""),
      difficulty: String(reading.difficulty || "3"),
      notes: reading.notes || "",
    });
    setIsEditingReading(true);
  }

  function cancelEditReading() {
    setIsEditingReading(false);
    setEditingReadingForm(null);
  }

  function saveEditedReading() {
    if (!selectedReading || !editingReadingForm?.title.trim()) return;

    const totalQuestions = clampNumber(editingReadingForm.totalQuestions, 13);
    const correctCount = Math.min(clampNumber(editingReadingForm.correctCount, 0), totalQuestions || 999);

    updateReading(selectedReading.id, {
      title: editingReadingForm.title.trim(),
      source: editingReadingForm.source.trim(),
      passageNumber: editingReadingForm.passageNumber.trim(),
      date: editingReadingForm.date || todayISO(),
      timeSpent: clampNumber(editingReadingForm.timeSpent, 0),
      totalQuestions,
      correctCount,
      difficulty: editingReadingForm.difficulty || "3",
      notes: editingReadingForm.notes.trim(),
    });

    setIsEditingReading(false);
    setEditingReadingForm(null);
  }

  return (
    <div className="readings-layout">
      <div className="sidebar-stack">
        <Card>
          <SectionTitle icon={Plus} title="新建阅读复盘" />
          <form onSubmit={createReading} className="form-stack">
            <Input label="标题" value={readingForm.title} onChange={(v) => setReadingForm({ ...readingForm, title: v })} placeholder="Cambridge IELTS 18 Test 2 Passage 1" />
            <Input label="来源" value={readingForm.source} onChange={(v) => setReadingForm({ ...readingForm, source: v })} placeholder="剑雅18 Test 2" />
            <div className="form-grid two">
              <Input label="Passage" value={readingForm.passageNumber} onChange={(v) => setReadingForm({ ...readingForm, passageNumber: v })} placeholder="1" />
              <Input type="date" label="日期" value={readingForm.date} onChange={(v) => setReadingForm({ ...readingForm, date: v })} />
            </div>
            <DifficultyPicker
              value={readingForm.difficulty || "3"}
              onChange={(v) => setReadingForm({ ...readingForm, difficulty: v })}
            />
            <div className="form-grid three">
              <Input type="number" label="用时" value={readingForm.timeSpent} onChange={(v) => setReadingForm({ ...readingForm, timeSpent: v })} placeholder="18" />
              <Input type="number" label="总题数" value={readingForm.totalQuestions} onChange={(v) => setReadingForm({ ...readingForm, totalQuestions: v })} />
              <Input type="number" label="正确数" value={readingForm.correctCount} onChange={(v) => setReadingForm({ ...readingForm, correctCount: v })} />
            </div>
            <Textarea label="备注" value={readingForm.notes} onChange={(v) => setReadingForm({ ...readingForm, notes: v })} placeholder="这篇主要错在定位和同义替换。" />
            <button className="primary-button">保存阅读</button>
          </form>
        </Card>

        <Card>
          <SectionTitle icon={BookOpen} title="阅读列表" />
          <div className="list-stack">
            {data.readings.length ? (
              data.readings.map((reading) => (
                <button
                  key={reading.id}
                  onClick={() => setSelectedReadingId(reading.id)}
                  className={`reading-list-button ${selectedReadingId === reading.id ? "active" : ""}`}
                >
                  <p>{reading.title}</p>
                  <span>{reading.date} · {reading.correctCount}/{reading.totalQuestions}</span>
                </button>
              ))
            ) : (
              <EmptyState text="先新建一篇阅读复盘。" />
            )}
          </div>
        </Card>
      </div>

      <div className="content-stack">
        {!selectedReading ? (
          <EmptyState text="请选择或新建一篇阅读，然后开始录入错题、生词和句子。" />
        ) : (
          <>
            <Card>
              {!isEditingReading ? (
                <div className="reading-summary">
                  <div>
                    <h2>{selectedReading.title}</h2>
                    <p className="muted-line">
                      {selectedReading.source || "未填写来源"} · {selectedReading.date} · 用时 {selectedReading.timeSpent || 0} 分钟 · 难度 {selectedReading.difficulty || "3"}/5
                    </p>
                    <p className="summary-score">
                      正确率：{selectedReading.totalQuestions ? Math.round((selectedReading.correctCount / selectedReading.totalQuestions) * 100) : 0}% · {selectedReading.correctCount}/{selectedReading.totalQuestions}
                    </p>
                    {selectedReading.notes && <p className="note-box">{selectedReading.notes}</p>}
                  </div>
                  <div className="reading-summary-actions">
                    <button type="button" onClick={() => startEditReading(selectedReading)} className="secondary-button">
                      编辑
                    </button>
                    <button onClick={() => deleteReading(selectedReading.id)} className="danger-button">
                      <Trash2 size={16} /> 删除
                    </button>
                  </div>
                </div>
              ) : (
                <div className="form-stack">
                  <SectionTitle icon={BookOpen} title="编辑阅读基本信息" subtitle="修改后会自动保存到本地，不会影响已录入的错题、生词和句子。" />
                  <Input label="标题" value={editingReadingForm.title} onChange={(v) => setEditingReadingForm({ ...editingReadingForm, title: v })} />
                  <Input label="来源" value={editingReadingForm.source} onChange={(v) => setEditingReadingForm({ ...editingReadingForm, source: v })} />
                  <div className="form-grid two">
                    <Input label="Passage" value={editingReadingForm.passageNumber} onChange={(v) => setEditingReadingForm({ ...editingReadingForm, passageNumber: v })} />
                    <Input type="date" label="日期" value={editingReadingForm.date} onChange={(v) => setEditingReadingForm({ ...editingReadingForm, date: v })} />
                  </div>
                  <DifficultyPicker
                    value={editingReadingForm.difficulty || "3"}
                    onChange={(v) => setEditingReadingForm({ ...editingReadingForm, difficulty: v })}
                  />
                  <div className="form-grid three">
                    <Input type="number" label="用时" value={editingReadingForm.timeSpent} onChange={(v) => setEditingReadingForm({ ...editingReadingForm, timeSpent: v })} />
                    <Input type="number" label="总题数" value={editingReadingForm.totalQuestions} onChange={(v) => setEditingReadingForm({ ...editingReadingForm, totalQuestions: v })} />
                    <Input type="number" label="正确数" value={editingReadingForm.correctCount} onChange={(v) => setEditingReadingForm({ ...editingReadingForm, correctCount: v })} />
                  </div>
                  <Textarea label="备注" value={editingReadingForm.notes} onChange={(v) => setEditingReadingForm({ ...editingReadingForm, notes: v })} />
                  <div className="reading-edit-actions">
                    <button type="button" className="primary-button" onClick={saveEditedReading}>保存修改</button>
                    <button type="button" className="secondary-button" onClick={cancelEditReading}>取消</button>
                  </div>
                </div>
              )}
            </Card>

            <div className="three-col-grid">
              <Card>
                <SectionTitle icon={Plus} title="添加错题" />
                <form onSubmit={createMistake} className="form-stack">
                  <Input label="题号" value={mistakeForm.questionNumber} onChange={(v) => setMistakeForm({ ...mistakeForm, questionNumber: v })} placeholder="Q6" />
                  <Select label="题型" value={mistakeForm.questionType} onChange={(v) => setMistakeForm({ ...mistakeForm, questionType: v })} options={questionTypeOptions.map((x) => ({ value: x, label: x }))} />
                  <div className="form-grid two">
                    <Input label="我的答案" value={mistakeForm.myAnswer} onChange={(v) => setMistakeForm({ ...mistakeForm, myAnswer: v })} />
                    <Input label="正确答案" value={mistakeForm.correctAnswer} onChange={(v) => setMistakeForm({ ...mistakeForm, correctAnswer: v })} />
                  </div>
                  <div>
                    <p className="field-label">错误原因</p>
                    <div className="chip-group">
                     {(mistakeReasons || defaultMistakeReasonOptions).map((reason) => (
                        <button
                          type="button"
                          key={reason}
                          onClick={() => toggleReason(reason)}
                          className={`chip ${mistakeForm.reasonTags.includes(reason) ? "active" : ""}`}
                        >
                          {reason}
                        </button>
                      ))}
                    </div>
                  </div>
                  <MistakeReasonManager
                    reasons={mistakeReasons}
                    newReason={newMistakeReason}
                    setNewReason={setNewMistakeReason}
                    addReason={addMistakeReason}
                    deleteReason={deleteMistakeReason}
                    resetReasons={resetMistakeReasons}
                  />
                  <Textarea label="原文句子" value={mistakeForm.originalSentence} onChange={(v) => setMistakeForm({ ...mistakeForm, originalSentence: v })} />
                  <Textarea label="复盘" value={mistakeForm.reflection} onChange={(v) => setMistakeForm({ ...mistakeForm, reflection: v })} />
                  <button className="primary-button">保存错题</button>
                </form>
              </Card>

              <Card>
                <SectionTitle icon={Plus} title="添加生词来源" />
                <form onSubmit={createWordOccurrence} className="form-stack">
                  <Input label="单词" value={wordForm.word} onChange={(v) => setWordForm({ ...wordForm, word: v })} placeholder="habitat" />
                  <Input label="中文词义" value={wordForm.meaning} onChange={(v) => setWordForm({ ...wordForm, meaning: v })} placeholder="栖息地" />
                  <Input label="英文释义" value={wordForm.englishMeaning} onChange={(v) => setWordForm({ ...wordForm, englishMeaning: v })} />
                  <Input label="音标" value={wordForm.pronunciation} onChange={(v) => setWordForm({ ...wordForm, pronunciation: v })} />
                  <Input label="相关题号" value={wordForm.questionNumber} onChange={(v) => setWordForm({ ...wordForm, questionNumber: v })} placeholder="Q6" />
                  <Textarea label="原句" value={wordForm.sentence} onChange={(v) => setWordForm({ ...wordForm, sentence: v })} />
                  <label className="checkbox-row">
                    <input type="checkbox" checked={wordForm.causedMistake} onChange={(e) => setWordForm({ ...wordForm, causedMistake: e.target.checked })} />
                    这个词导致了错题
                  </label>
                  <Textarea label="备注" value={wordForm.note} onChange={(v) => setWordForm({ ...wordForm, note: v })} placeholder="living places = habitats" />
                  <button className="primary-button">保存生词来源</button>
                </form>
              </Card>

              <Card>
                <SectionTitle icon={Plus} title="添加句子" />
                <form onSubmit={createSentence} className="form-stack">
                  <Textarea label="句子" value={sentenceForm.content} onChange={(v) => setSentenceForm({ ...sentenceForm, content: v })} />
                  <Select label="类型" value={sentenceForm.type} onChange={(v) => setSentenceForm({ ...sentenceForm, type: v })} options={sentenceTypeOptions.map((x) => ({ value: x, label: x }))} />
                  <Textarea label="翻译" value={sentenceForm.translation} onChange={(v) => setSentenceForm({ ...sentenceForm, translation: v })} />
                  <Input label="话题" value={sentenceForm.topic} onChange={(v) => setSentenceForm({ ...sentenceForm, topic: v })} placeholder="城市化 / 环境" />
                  <Textarea label="备注" value={sentenceForm.note} onChange={(v) => setSentenceForm({ ...sentenceForm, note: v })} />
                  <button className="primary-button">保存句子</button>
                </form>
              </Card>
            </div>

            <div className="three-col-grid">
              <ListCard title="本篇错题" items={readingMistakes} empty="还没有录入错题。" render={(item) => <MistakeItem item={item} onDelete={() => deleteItem("mistakes", item.id)} />} />
              <ListCard
                title="本篇生词来源"
                items={readingOccurrences}
                empty="还没有录入生词来源。"
                render={(item) => <OccurrenceItem item={item} word={data.words.find((word) => word.id === item.wordId)} onDelete={() => deleteItem("wordOccurrences", item.id)} />}
              />
              <ListCard title="本篇句子" items={readingSentences} empty="还没有录入句子。" render={(item) => <SentenceItem item={item} onDelete={() => deleteItem("sentences", item.id)} />} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ReadingMistakeCategoryPanel({ mistakes, selectedReading, retakePlan, saveRetakePlan }) {
  const [needRetake, setNeedRetake] = useState(retakePlan?.needRetake ?? false);
  const [retakeDate, setRetakeDate] = useState(
    retakePlan?.retakeDate || recommendRetakeDate(selectedReading?.date, mistakes.length)
  );
  const [reason, setReason] = useState(retakePlan?.reason || "");

  useEffect(() => {
    setNeedRetake(retakePlan?.needRetake ?? false);
    setRetakeDate(retakePlan?.retakeDate || recommendRetakeDate(selectedReading?.date, mistakes.length));
    setReason(retakePlan?.reason || "");
  }, [retakePlan, selectedReading?.id, selectedReading?.date, mistakes.length]);

  const categoryCounts = mistakeCategoryOptions.map((category) => ({
    category,
    count: mistakes.filter((mistake) => (mistake.category || inferMistakeCategory(mistake.questionType)) === category).length,
  }));

  const recommendedDate = recommendRetakeDate(selectedReading?.date, mistakes.length);
  const recommendationText = mistakes.length >= 4
    ? "错题较多，建议 10 天后重做。"
    : mistakes.length > 0
      ? "错题较少，默认建议 20 天后重做；如果题目有代表性，也可以提前安排。"
      : "这篇目前没有错题。只有在难度高或题目很有代表性时，才建议手动安排重做。";

  function handleSave() {
    saveRetakePlan(selectedReading.id, {
      needRetake,
      retakeDate,
      reason,
    });
  }

  return (
    <Card>
      <SectionTitle icon={BarChart3} title="本篇错题类型统计与重做安排" subtitle="按雅思阅读常见大类统计，并把重做任务放到 Dashboard" />
      <div className="retake-panel-grid">
        <div className="category-stat-grid">
          {categoryCounts.map((item) => (
            <div key={item.category} className={`category-stat-card ${item.count > 0 ? "has-error" : ""}`}>
              <span>{item.category}</span>
              <strong>{item.count}</strong>
            </div>
          ))}
        </div>

        <div className="retake-box">
          <p className="mini-title">重做建议</p>
          <p className="mini-body">{recommendationText}</p>
          <p className="mini-muted">系统推荐日期：{recommendedDate}</p>

          <label className="checkbox-row retake-checkbox">
            <input
              type="checkbox"
              checked={needRetake}
              onChange={(event) => setNeedRetake(event.target.checked)}
            />
            这篇需要安排重做
          </label>

          <Input label="重做日期" type="date" value={retakeDate} onChange={setRetakeDate} />
          <Textarea
            label="重做原因"
            value={reason}
            onChange={setReason}
            placeholder="例如：虽然只错 2 题，但多选题很有代表性；或者判断题错得集中。"
          />
          <button type="button" className="primary-button" onClick={handleSave}>保存重做安排</button>
          {retakePlan?.completed && <p className="success-text">这篇重做任务已完成。</p>}
        </div>
      </div>
    </Card>
  );
}

function VocabularyPage({
  data,
  searchWord,
  setSearchWord,
  statusFilter,
  setStatusFilter,
  updateWordStatus,
  updateWordReview,
  deleteWord,
  standaloneWordForm,
  setStandaloneWordForm,
  createStandaloneWord,
}) {
  const [expandedWordId, setExpandedWordId] = useState(null);

  const words = data.words
    .filter((word) => {
      const matchesSearch = !searchWord || word.word.toLowerCase().includes(searchWord.toLowerCase()) || word.meaning.includes(searchWord);
      const matchesStatus = statusFilter === "all" || word.status === statusFilter;
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      const dateCompare = String(a.nextReviewDate || "").localeCompare(String(b.nextReviewDate || ""));
      if (dateCompare !== 0) return dateCompare;
      return String(a.word).localeCompare(String(b.word));
    });

  const today = todayISO();
  const dueCount = data.words.filter((word) => word.status !== "mastered" && (!word.nextReviewDate || word.nextReviewDate <= today)).length;

  return (
    <div className="page-stack">
      <Card>
        <SectionTitle
          icon={Plus}
          title="单独录入词汇"
          subtitle="用于补录不属于某篇阅读的单词，或先建立词库后再补来源。"
        />
        <form onSubmit={createStandaloneWord} className="form-stack">
          <div className="form-grid two">
            <Input
              label="单词"
              value={standaloneWordForm.word}
              onChange={(v) => setStandaloneWordForm({ ...standaloneWordForm, word: v })}
              placeholder="例如：substantial"
            />
            <Input
              label="中文词义"
              value={standaloneWordForm.meaning}
              onChange={(v) => setStandaloneWordForm({ ...standaloneWordForm, meaning: v })}
              placeholder="大量的；重要的"
            />
          </div>

          <div className="form-grid two">
            <Input
              label="英文释义"
              value={standaloneWordForm.englishMeaning}
              onChange={(v) => setStandaloneWordForm({ ...standaloneWordForm, englishMeaning: v })}
              placeholder="large in amount, value, or importance"
            />
            <Input
              label="音标"
              value={standaloneWordForm.pronunciation}
              onChange={(v) => setStandaloneWordForm({ ...standaloneWordForm, pronunciation: v })}
              placeholder="/səbˈstænʃəl/"
            />
          </div>

          <Textarea
            label="备注"
            value={standaloneWordForm.notes}
            onChange={(v) => setStandaloneWordForm({ ...standaloneWordForm, notes: v })}
            placeholder="可以写搭配、易混词、雅思常见用法等。"
          />

          <button className="primary-button">加入词库</button>
        </form>
      </Card>

      <Card>
        <SectionTitle icon={Library} title="本地词库" subtitle="列表形式更适合背词；点击一行可以展开来源和原句。" />
        <div className="vocab-summary-row">
          <StatCard label="词库总数" value={data.words.length} />
          <StatCard label="今日待复习" value={dueCount} />
          <StatCard label="已掌握" value={data.words.filter((word) => word.status === "mastered").length} />
        </div>
        <div className="search-row vocab-search-row">
          <div className="search-box">
            <Search size={18} />
            <input value={searchWord} onChange={(e) => setSearchWord(e.target.value)} placeholder="搜索单词或中文词义" />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="select-input">
            <option value="all">全部状态</option>
            {wordStatusOptions.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </div>
      </Card>

      <Card className="vocab-list-card">
        {words.length ? (
          <div className="vocab-list">
            <div className="vocab-list-head">
              <span>单词</span>
              <span>词义</span>
              <span>状态</span>
              <span>复习</span>
              <span>来源</span>
              <span>操作</span>
            </div>
            {words.map((word) => {
              const occurrences = data.wordOccurrences.filter((item) => item.wordId === word.id);
              const caused = occurrences.some((item) => item.causedMistake);
              const isDue = word.status !== "mastered" && (!word.nextReviewDate || word.nextReviewDate <= today);
              const expanded = expandedWordId === word.id;

              return (
                <div key={word.id} className={`vocab-row-wrap ${isDue ? "due" : ""}`}>
                  <div className="vocab-row" onClick={() => setExpandedWordId(expanded ? null : word.id)}>
                    <div className="vocab-word-cell">
                      <strong>{word.word}</strong>
                      {word.pronunciation && <small>{word.pronunciation}</small>}
                      {isDue && <span className="due-badge">今日复习</span>}
                    </div>
                    <div className="vocab-meaning-cell">{word.meaning || "未填写中文词义"}</div>
                    <div>
                      <select
                        value={word.status}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => updateWordStatus(word.id, event.target.value)}
                        className="compact-select"
                      >
                        {wordStatusOptions.map((item) => (
                          <option key={item.value} value={item.value}>{item.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="review-info-cell">
                      <span>{clampNumber(word.reviewCount, 0)} 次</span>
                      <small>{word.nextReviewDate || "今天"}</small>
                    </div>
                    <div className="source-count-cell">
                      <span>{occurrences.length} 条</span>
                      {caused && <small className="danger-text">曾导致错题</small>}
                    </div>
                    <div className="vocab-actions" onClick={(event) => event.stopPropagation()}>
                      <button type="button" className="remember-button" onClick={() => updateWordReview(word.id, "remember")}>认识</button>
                      <button type="button" className="fuzzy-button" onClick={() => updateWordReview(word.id, "fuzzy")}>模糊</button>
                      <button type="button" className="forgot-button" onClick={() => updateWordReview(word.id, "forgot")}>不认识</button>
                      <button type="button" onClick={() => deleteWord(word.id)} className="icon-button danger"><Trash2 size={16} /></button>
                    </div>
                  </div>

                  {expanded && (
                    <div className="vocab-expanded">
                      <div className="expanded-grid">
                        <div>
                          <p className="field-label">英文释义</p>
                          <p className="mini-body">{word.englishMeaning || "未填写"}</p>
                        </div>
                        <div>
                          <p className="field-label">复习阶段</p>
                          <p className="mini-body">{getReviewStageLabel(word.reviewCount)}</p>
                        </div>
                        <div>
                          <p className="field-label">备注</p>
                          <p className="mini-body">{word.notes || "未填写"}</p>
                        </div>
                      </div>
                      <div className="source-list expanded-source-list">
                        <p className="field-label">雅思来源</p>
                        {occurrences.length ? (
                          occurrences.map((occurrence) => {
                            const reading = data.readings.find((item) => item.id === occurrence.readingId);
                            return (
                              <div key={occurrence.id} className="source-item">
                                <p>{reading?.title || "未知阅读"} {occurrence.questionNumber && `· ${occurrence.questionNumber}`}</p>
                                {occurrence.sentence && <span>{occurrence.sentence}</span>}
                                {occurrence.note && <span>{occurrence.note}</span>}
                              </div>
                            );
                          })
                        ) : (
                          <EmptyState text="这个词还没有来源记录。" />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState text="还没有符合条件的词。请先在阅读复盘里添加生词来源。" />
        )}
      </Card>
    </div>
  );
}

function SentencesPage({ data, deleteItem }) {
  const grouped = sentenceTypeOptions.reduce((acc, type) => {
    acc[type] = data.sentences.filter((item) => item.type === type);
    return acc;
  }, {});

  return (
    <div className="page-stack">
      <Card>
        <SectionTitle icon={MessageSquareText} title="句库" subtitle="长难句、同义替换和写作可用句都可以在这里回看。" />
      </Card>
      <div className="two-col-grid">
        {sentenceTypeOptions.map((type) => (
          <Card key={type}>
            <h3 className="card-subtitle">{type} · {grouped[type].length}</h3>
            <div className="list-stack">
              {grouped[type].length ? (
                grouped[type].map((sentence) => {
                  const reading = data.readings.find((item) => item.id === sentence.readingId);
                  return <SentenceItem key={sentence.id} item={sentence} reading={reading} onDelete={() => deleteItem("sentences", sentence.id)} />;
                })
              ) : (
                <EmptyState text={`还没有${type}。`} />
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ListCard({ title, items, empty, render }) {
  return (
    <Card>
      <h3 className="card-subtitle">{title} · {items.length}</h3>
      <div className="list-stack">{items.length ? items.map(render) : <EmptyState text={empty} />}</div>
    </Card>
  );
}

function MistakeItem({ item, onDelete }) {
  return (
    <div className="mini-card">
      <div className="mini-head">
        <div>
          <p className="mini-title">{item.questionNumber} · {item.questionType}</p>
          <p className="mini-muted">我的答案：{item.myAnswer || "未填"} / 正确答案：{item.correctAnswer || "未填"}</p>
        </div>
        <IconDelete onClick={onDelete} />
      </div>
      {!!item.reasonTags?.length && <p className="mini-tags">{item.reasonTags.join("、")}</p>}
      {item.reflection && <p className="mini-body">{item.reflection}</p>}
    </div>
  );
}

function OccurrenceItem({ item, word, onDelete }) {
  return (
    <div className="mini-card">
      <div className="mini-head">
        <div>
          <p className="mini-title">{word?.word || "未知词"} {item.questionNumber && `· ${item.questionNumber}`}</p>
          <p className="mini-muted">{word?.meaning || "未填写词义"}</p>
        </div>
        <IconDelete onClick={onDelete} />
      </div>
      {item.sentence && <p className="mini-body">{item.sentence}</p>}
      {item.causedMistake && <p className="danger-text">导致错题</p>}
    </div>
  );
}

function SentenceItem({ item, reading, onDelete }) {
  return (
    <div className="mini-card">
      <div className="mini-head">
        <div>
          <p className="mini-title">{item.content}</p>
          {reading && <p className="mini-muted">来源：{reading.title}</p>}
        </div>
        <IconDelete onClick={onDelete} />
      </div>
      {item.translation && <p className="mini-body">{item.translation}</p>}
      <div className="badge-row">
        <span className="badge">{item.type}</span>
        {item.topic && <span className="badge">{item.topic}</span>}
      </div>
      {item.note && <p className="mini-muted">{item.note}</p>}
    </div>
  );
}

function IconDelete({ onClick }) {
  return <button onClick={onClick} className="icon-button danger"><Trash2 size={15} /></button>;
}

function MistakeReasonManager({ reasons, newReason, setNewReason, addReason, deleteReason, resetReasons }) {
  return (
    <div className="mistake-reason-manager">
      <div className="reason-manager-head">
        <p className="field-label">管理错误原因</p>
        <button type="button" className="text-button" onClick={resetReasons}>恢复默认</button>
      </div>
      <div className="reason-add-row">
        <input
          value={newReason}
          onChange={(event) => setNewReason(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addReason();
            }
          }}
          placeholder="新增错误原因，如：审题太急"
        />
        <button type="button" onClick={addReason}>添加</button>
      </div>
      <div className="reason-edit-list">
        {reasons.map((reason) => (
          <span key={reason} className="reason-edit-chip">
            {reason}
            <button type="button" onClick={() => deleteReason(reason)} title={`删除 ${reason}`}>×</button>
          </span>
        ))}
      </div>
    </div>
  );
}

function DifficultyPicker({ value, onChange }) {
  return (
    <div className="field">
      <span>难度</span>
      <div className="difficulty-picker">
        {difficultyOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`difficulty-button ${String(value) === option.value ? "active" : ""}`}
            onClick={() => onChange(option.value)}
            title={`${option.value} · ${option.label}`}
          >
            <strong>{option.value}</strong>
            <small>{option.label}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

function Input({ label, value, onChange, placeholder = "", type = "text" }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}

function Textarea({ label, value, onChange, placeholder = "" }) {
  return (
    <label className="field">
      <span>{label}</span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={3} />
    </label>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}