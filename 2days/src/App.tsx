import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  BookOpen,
  Settings,
  CheckCircle,
  AlertCircle,
  Play,
  Pause,
  RotateCcw,
  Save,
  BarChart,
  Target,
  Smile,
  Frown,
  Plus,
  Trash2,
  Lock,
  RefreshCw,
  Flag,
} from 'lucide-react';

// --- Types ---

// 難易度を10段階に変更
type Difficulty = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

interface Subject {
  id: string;
  name: string;
  difficulty: Difficulty;
  testDate: string; // 科目ごとのテスト日
  color: string;
}

interface UserSettings {
  weekdayHours: number;
  weekendHours: number;
  maxSubjectsPerDay: number; // 追加: 1日の最大科目数
}

interface DailyTask {
  id: string;
  subjectId: string;
  date: string;
  plannedMinutes: number;
  completed: boolean;
  actualMinutes: number;
  isFixed: boolean;
}

type ViewMode = 'dashboard' | 'timer';

// --- Constants & Helpers ---

const COLORS = [
  'bg-red-200 text-red-800',
  'bg-orange-200 text-orange-800',
  'bg-amber-200 text-amber-800',
  'bg-green-200 text-green-800',
  'bg-emerald-200 text-emerald-800',
  'bg-teal-200 text-teal-800',
  'bg-cyan-200 text-cyan-800',
  'bg-sky-200 text-sky-800',
  'bg-blue-200 text-blue-800',
  'bg-indigo-200 text-indigo-800',
  'bg-violet-200 text-violet-800',
  'bg-purple-200 text-purple-800',
  'bg-fuchsia-200 text-fuchsia-800',
  'bg-pink-200 text-pink-800',
  'bg-rose-200 text-rose-800',
];

const getRandomColor = () => COLORS[Math.floor(Math.random() * COLORS.length)];

// タイムゾーンによる日付ズレを防ぐためのヘルパー関数
const toLocalDateString = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const uuid = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 11) + '-' + Date.now();
};

const STORAGE_KEY = 'test_schedule_app_data';

// --- Components ---

export default function TestScheduleApp() {
  // State
  const [subjects, setSubjects] = useState<Subject[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        return data.subjects || [];
      } catch (e) {
        console.error('Failed to parse subjects:', e);
      }
    }
    return [];
  });

  const [schedule, setSchedule] = useState<DailyTask[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        return data.schedule || [];
      } catch (e) {
        console.error('Failed to parse schedule:', e);
      }
    }
    return [];
  });

  const [settings, setSettings] = useState<UserSettings>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    const defaultSettings = {
      weekdayHours: 2,
      weekendHours: 5,
      maxSubjectsPerDay: 3,
    };
    if (saved) {
      try {
        const data = JSON.parse(saved);
        return data.settings || defaultSettings;
      } catch (e) {
        console.error('Failed to parse settings:', e);
      }
    }
    return defaultSettings;
  });

  const [view, setView] = useState<ViewMode>('dashboard');

  // UI State
  const [feedback, setFeedback] = useState<{
    message: string;
    type: 'praise' | 'scold' | null;
  } | null>(null);
  const [currentDateForCalendar, setCurrentDateForCalendar] = useState(
    new Date()
  );

  // Form State
  const [formSubjectName, setFormSubjectName] = useState('');
  const [formDifficulty, setFormDifficulty] = useState<Difficulty>(3);
  const [formDate, setFormDate] = useState(''); // テスト日として使用

  // Timer State
  const [activeTask, setActiveTask] = useState<DailyTask | null>(null);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);

  // Auto-save
  useEffect(() => {
    // データを保存
    const dataToSave = { subjects, schedule, settings };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
  }, [subjects, schedule, settings]);

  // --- Logic Helpers ---

  const addSubject = () => {
    if (!formSubjectName || !formDate) return;

    // 既に同名の科目があるか確認（簡易的な重複チェック）
    const existingSubject = subjects.find((s: Subject) => s.name === formSubjectName);
    if (existingSubject) {
      setFeedback({
        message: `「${formSubjectName}」は既に追加されています。`,
        type: 'scold',
      });
      return;
    }

    const newSubject: Subject = {
      id: uuid(),
      name: formSubjectName,
      difficulty: formDifficulty,
      testDate: formDate,
      color: getRandomColor(),
    };

    setSubjects([...subjects, newSubject]);
    setFeedback({
      message: `「${formSubjectName}」を追加しました（テスト日: ${formDate}）。自動作成ボタンでスケジュールを生成してください。`,
      type: 'praise',
    });

    // Reset Form
    setFormSubjectName('');
    // 日付は連続入力のために残すか、リセットするか。今回はリセットしない方が便利かもですが、誤入力を防ぐためリセットします。
    setFormDate('');
  };

  const deleteSubject = (id: string) => {
    setSubjects(subjects.filter((s) => s.id !== id));
    setSchedule(schedule.filter((t) => t.subjectId !== id));
  };

  const deleteTask = (taskId: string) => {
    setSchedule(schedule.filter((t) => t.id !== taskId));
  };

  // 難易度に基づいた必要学習時間
  const calculateTotalHoursNeeded = (diff: Difficulty) => diff * 3;

  const generateSchedule = () => {
    if (subjects.length === 0) return;

    // 1. 固定タスク・完了タスクは維持
    const fixedOrCompletedTasks = schedule.filter(
      (t) => t.isFixed || t.completed
    );

    // 2. 各科目の「残り必要時間」を計算
    let pendingWork = subjects
      .map((s: Subject) => {
        const totalNeededMins = calculateTotalHoursNeeded(s.difficulty) * 60;
        const allocatedMins = fixedOrCompletedTasks
          .filter((t: DailyTask) => t.subjectId === s.id)
          .reduce(
            (sum: number, t: DailyTask) =>
              sum + (t.completed ? t.actualMinutes : t.plannedMinutes),
            0
          );

        return {
          subject: s,
          minutesNeeded: Math.max(0, totalNeededMins - allocatedMins),
        };
      })
      .filter((w) => w.minutesNeeded > 0);

    const newAutoTasks: DailyTask[] = [];
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    let currentDate = new Date(start);
    let daysCount = 0;
    const MAX_DAYS = 365; // 1年先まで計算

    // スケジュール割り振りループ
    while (
      pendingWork.some((w) => w.minutesNeeded > 0) &&
      daysCount < MAX_DAYS
    ) {
      const dateStr = toLocalDateString(currentDate);
      const dayOfWeek = currentDate.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const maxMinutes =
        (isWeekend ? settings.weekendHours : settings.weekdayHours) * 60;

      // この日の既存タスク時間を計算
      const existingMinsToday = fixedOrCompletedTasks
        .filter((t: DailyTask) => t.date === dateStr)
        .reduce((sum: number, t: DailyTask) => sum + t.plannedMinutes, 0);

      // この日割り当て済みの科目IDを追跡
      const assignedSubjectIdsToday = new Set<string>();
      fixedOrCompletedTasks
        .filter((t: DailyTask) => t.date === dateStr)
        .forEach((t: DailyTask) => assignedSubjectIdsToday.add(t.subjectId));

      let minutesAllocatedToday = existingMinsToday;

      // 今日がテスト日以前である科目のみを抽出
      // 優先順位: テスト日が近い順 > 難易度が高い順
      const activeSubjects = pendingWork
        .filter((w: any) => dateStr <= w.subject.testDate && w.minutesNeeded > 0)
        .sort((a: any, b: any) => {
          if (a.subject.testDate !== b.subject.testDate) {
            return a.subject.testDate.localeCompare(b.subject.testDate);
          }
          return b.subject.difficulty - a.subject.difficulty;
        });

      // 空き時間があれば割り振る
      while (minutesAllocatedToday < maxMinutes && activeSubjects.length > 0) {
        const work = activeSubjects[0]; // 最も優先度の高い科目

        // 【科目数制限チェック】
        // まだこの科目が今日割り当てられておらず、かつ、既に制限数に達している場合
        if (
          !assignedSubjectIdsToday.has(work.subject.id) &&
          assignedSubjectIdsToday.size >= settings.maxSubjectsPerDay
        ) {
          // この科目は今日はスキップ（リストから削除して次へ）
          activeSubjects.shift();
          continue;
        }

        const slot = 30; // 30分単位
        const timeToAllocate = Math.min(
          slot,
          maxMinutes - minutesAllocatedToday,
          work.minutesNeeded
        );

        // タスク生成・マージ
        const existingAutoTaskIndex = newAutoTasks.findIndex(
          (t) => t.date === dateStr && t.subjectId === work.subject.id
        );

        if (existingAutoTaskIndex >= 0) {
          newAutoTasks[existingAutoTaskIndex].plannedMinutes += timeToAllocate;
        } else {
          newAutoTasks.push({
            id: uuid(),
            subjectId: work.subject.id,
            date: dateStr,
            plannedMinutes: timeToAllocate,
            completed: false,
            actualMinutes: 0,
            isFixed: false,
          });
        }

        assignedSubjectIdsToday.add(work.subject.id);
        work.minutesNeeded -= timeToAllocate;
        minutesAllocatedToday += timeToAllocate;

        if (work.minutesNeeded <= 0) {
          activeSubjects.shift();
        } else {
          activeSubjects.push(activeSubjects.shift()!);
        }
      }

      currentDate.setDate(currentDate.getDate() + 1);
      daysCount++;
    }

    setSchedule([...fixedOrCompletedTasks, ...newAutoTasks]);
    setFeedback({
      message: `スケジュールを再生成しました（1日最大${settings.maxSubjectsPerDay}科目）`,
      type: 'praise',
    });
  };

  const handleTaskComplete = (task: DailyTask, actualMins: number) => {
    const updatedSchedule = schedule.map((t) => {
      if (t.id === task.id) {
        return { ...t, completed: true, actualMinutes: actualMins };
      }
      return t;
    });
    setSchedule(updatedSchedule);

    // Feedback
    const diff = actualMins - task.plannedMinutes;
    if (diff >= 0) {
      setFeedback({
        message: `素晴らしい！予定より${diff === 0 ? 'ぴったり' : diff + '分多く'
          }勉強しました。`,
        type: 'praise',
      });
    } else if (actualMins > 0) {
      setFeedback({
        message: `お疲れ様。予定より${Math.abs(
          diff
        )}分少ないですが、継続が大事です。`,
        type: 'scold',
      });
    } else {
      setFeedback({
        message: `サボりは禁物です。次は頑張りましょう。`,
        type: 'scold',
      });
    }

    setActiveTask(null);
    setTimerSeconds(0);
    setIsTimerRunning(false);
    setView('dashboard');
  };

  // --- Calendar Helpers ---
  const getDaysInMonth = (year: number, month: number) =>
    new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) =>
    new Date(year, month, 1).getDay();

  const generateCalendarGrid = () => {
    const year = currentDateForCalendar.getFullYear();
    const month = currentDateForCalendar.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);

    const grid = [];
    for (let i = 0; i < firstDay; i++) {
      grid.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      grid.push(new Date(year, month, i));
    }
    return grid;
  };

  // 直近のテスト日を取得
  const getNextTestDays = () => {
    if (subjects.length === 0) return null;
    // ここもローカル日付を使用
    const today = toLocalDateString(new Date());
    const upcoming = subjects
      .filter((s) => s.testDate >= today)
      .sort((a, b) => a.testDate.localeCompare(b.testDate));

    if (upcoming.length === 0) return null;
    return upcoming[0];
  };

  const nextTestSubject = getNextTestDays();

  // --- Views ---

  const TimerOverlay = () => {
    if (!activeTask) return null;
    const subject = subjects.find((s) => s.id === activeTask.subjectId);

    useEffect(() => {
      let interval: any;
      if (isTimerRunning) {
        interval = setInterval(() => setTimerSeconds((s) => s + 1), 1000);
      }
      return () => clearInterval(interval);
    }, [isTimerRunning]);

    const formatTime = (totalSeconds: number) => {
      const h = Math.floor(totalSeconds / 3600);
      const m = Math.floor((totalSeconds % 3600) / 60);
      const s = totalSeconds % 60;
      return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s
        .toString()
        .padStart(2, '0')}`;
    };

    return (
      <div className="fixed inset-0 bg-slate-900/90 z-50 flex items-center justify-center p-4 animate-in fade-in">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-2xl">
          <h3 className="text-sm text-slate-500 uppercase tracking-wider mb-2">
            NOW STUDYING
          </h3>
          <h2 className="text-3xl font-bold text-slate-800 mb-1">
            {subject?.name}
          </h2>
          <div className="text-indigo-500 font-medium mb-8">
            目標: {activeTask.plannedMinutes}分
          </div>

          <div className="text-6xl font-mono font-bold text-slate-800 mb-8 tabular-nums">
            {formatTime(timerSeconds)}
          </div>

          <div className="flex justify-center gap-4 mb-8">
            <button
              onClick={() => setIsTimerRunning(!isTimerRunning)}
              className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition active:scale-95 ${isTimerRunning
                ? 'bg-amber-100 text-amber-600'
                : 'bg-indigo-600 text-white'
                }`}
            >
              {isTimerRunning ? (
                <Pause className="w-8 h-8" />
              ) : (
                <Play className="w-8 h-8 ml-1" />
              )}
            </button>

            {!isTimerRunning && timerSeconds > 0 && (
              <button
                onClick={() => {
                  const actual = Math.ceil(timerSeconds / 60);
                  const userActual = window.prompt(
                    '学習時間(分)を入力してください',
                    actual.toString()
                  );
                  if (userActual !== null) {
                    handleTaskComplete(
                      activeTask,
                      parseInt(userActual) || actual
                    );
                  }
                }}
                className="w-16 h-16 rounded-full bg-green-500 text-white flex items-center justify-center shadow-lg transition active:scale-95 hover:bg-green-600"
              >
                <CheckCircle className="w-8 h-8" />
              </button>
            )}
          </div>

          <button
            onClick={() => {
              setView('dashboard');
              setActiveTask(null);
              setIsTimerRunning(false);
            }}
            className="text-slate-400 hover:text-slate-600 text-sm underline"
          >
            中止して戻る
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-900 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 shadow-sm flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Target className="w-6 h-6 text-indigo-600" />
          <h1 className="font-bold text-xl text-slate-800">
            テスト勉強スケジュール
          </h1>
        </div>
        {nextTestSubject ? (
          <div className="text-sm font-medium text-slate-500 flex items-center gap-2">
            次のテスト:{' '}
            <span className="font-bold text-indigo-600">
              {nextTestSubject.name}
            </span>
            <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded-full text-xs font-bold">
              あと{' '}
              {Math.ceil(
                (new Date(nextTestSubject.testDate).getTime() -
                  new Date().getTime()) /
                (1000 * 60 * 60 * 24)
              )}{' '}
              日
            </span>
          </div>
        ) : (
          <div className="text-sm text-slate-400">
            予定されているテストはありません
          </div>
        )}
      </header>

      <main className="flex-1 p-4 md:p-6 md:overflow-hidden">
        <div className="max-w-7xl mx-auto h-full flex flex-col md:flex-row gap-6">
          {/* Left Panel: Settings & Input */}
          <aside className="md:w-1/3 lg:w-1/4 space-y-6 md:overflow-y-auto md:pr-2 md:h-[calc(100vh-100px)]">
            {/* 1. 科目追加フォーム */}
            <section className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
              <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Plus className="w-5 h-5 text-indigo-500" /> 科目追加
              </h2>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500">
                    科目名
                  </label>
                  <input
                    type="text"
                    className="w-full border p-2 rounded-lg mt-1 focus:ring-2 focus:ring-indigo-200 outline-none"
                    placeholder="例: 数学I"
                    value={formSubjectName}
                    onChange={(e) => setFormSubjectName(e.target.value)}
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs font-semibold text-slate-500">
                      難易度
                    </label>
                    <span className="text-sm font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                      Lv.{formDifficulty}
                    </span>
                  </div>

                  <input
                    type="range"
                    min="1"
                    max="10"
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 mb-1"
                    value={formDifficulty}
                    onChange={(e) =>
                      setFormDifficulty(Number(e.target.value) as Difficulty)
                    }
                  />

                  <div className="flex justify-between items-center px-1">
                    <span
                      className={`text-[10px] transition-all duration-300 ${formDifficulty <= 3
                        ? 'text-blue-600 font-bold scale-110'
                        : 'text-slate-300'
                        }`}
                    >
                      簡単
                    </span>
                    <span
                      className={`text-[10px] transition-all duration-300 ${formDifficulty >= 4 && formDifficulty <= 7
                        ? 'text-amber-500 font-bold scale-110'
                        : 'text-slate-300'
                        }`}
                    >
                      普通
                    </span>
                    <span
                      className={`text-[10px] transition-all duration-300 ${formDifficulty >= 8
                        ? 'text-red-500 font-bold scale-110'
                        : 'text-slate-300'
                        }`}
                    >
                      激ムズ
                    </span>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                    <Flag className="w-3 h-3 text-red-500" /> テスト日 (必須)
                  </label>
                  <input
                    type="date"
                    className="w-full border p-2 rounded-lg mt-1"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    required
                  />
                </div>

                <button
                  onClick={addSubject}
                  disabled={!formSubjectName || !formDate}
                  className="w-full bg-indigo-600 text-white font-bold py-2 rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 mt-2"
                >
                  科目を追加
                </button>
              </div>
            </section>

            {/* 2. 設定 */}
            <section className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
              <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Settings className="w-5 h-5 text-slate-500" /> 全般設定
              </h2>
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-500 mb-1">
                      平日 (h)
                    </label>
                    <input
                      type="number"
                      className="w-full border p-2 rounded"
                      value={settings.weekdayHours}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          weekdayHours: Number(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-1">
                      休日 (h)
                    </label>
                    <input
                      type="number"
                      className="w-full border p-2 rounded"
                      value={settings.weekendHours}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          weekendHours: Number(e.target.value),
                        })
                      }
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">
                    1日の最大科目数
                  </label>
                  <input
                    type="number"
                    min="1"
                    className="w-full border p-2 rounded"
                    value={settings.maxSubjectsPerDay}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        maxSubjectsPerDay: Number(e.target.value),
                      })
                    }
                  />
                </div>
              </div>
            </section>

            {/* 3. 科目リスト */}
            <section className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
              <div className="flex justify-between items-center mb-2">
                <h2 className="font-bold text-slate-800 flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-slate-500" /> 登録科目
                </h2>
              </div>

              <div className="space-y-2 max-h-40 overflow-y-auto">
                {subjects.length === 0 && (
                  <p className="text-xs text-slate-400">科目がありません</p>
                )}
                {subjects.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between text-sm p-2 bg-slate-50 rounded border border-slate-100"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-3 h-3 rounded-full ${s.color}`}
                        ></div>
                        <span className="font-medium">{s.name}</span>
                        <span className="text-xs text-slate-400">
                          Lv.{s.difficulty}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500 ml-5 mt-0.5 flex items-center gap-1">
                        <Flag className="w-3 h-3" />{' '}
                        {new Date(s.testDate).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      onClick={() => deleteSubject(s.id)}
                      className="text-slate-400 hover:text-red-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={generateSchedule}
                className="w-full mt-4 bg-amber-100 text-amber-800 py-2 rounded-lg font-bold text-sm flex items-center justify-center gap-2 hover:bg-amber-200 transition"
              >
                <RefreshCw className="w-4 h-4" />
                スケジュール自動作成
              </button>
            </section>
          </aside>

          {/* Right Panel: Calendar Grid */}
          <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col md:h-[calc(100vh-100px)] overflow-hidden">
            {/* Calendar Header */}
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-4">
                <h2 className="text-xl font-bold text-slate-800">
                  {currentDateForCalendar.getFullYear()}年{' '}
                  {currentDateForCalendar.getMonth() + 1}月
                </h2>
                <div className="flex gap-1">
                  <button
                    onClick={() =>
                      setCurrentDateForCalendar(
                        new Date(
                          currentDateForCalendar.setMonth(
                            currentDateForCalendar.getMonth() - 1
                          )
                        )
                      )
                    }
                    className="p-1 hover:bg-slate-200 rounded"
                  >
                    ←
                  </button>
                  <button
                    onClick={() => setCurrentDateForCalendar(new Date())}
                    className="text-xs px-2 py-1 bg-white border rounded hover:bg-slate-50"
                  >
                    今日
                  </button>
                  <button
                    onClick={() =>
                      setCurrentDateForCalendar(
                        new Date(
                          currentDateForCalendar.setMonth(
                            currentDateForCalendar.getMonth() + 1
                          )
                        )
                      )
                    }
                    className="p-1 hover:bg-slate-200 rounded"
                  >
                    →
                  </button>
                </div>
              </div>
            </div>

            {/* Calendar Grid */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-7 gap-px bg-slate-200 border border-slate-200 rounded-lg overflow-hidden">
                {['日', '月', '火', '水', '木', '金', '土'].map((d, i) => (
                  <div
                    key={i}
                    className={`bg-slate-50 p-2 text-center text-xs font-bold ${i === 0
                      ? 'text-red-500'
                      : i === 6
                        ? 'text-blue-500'
                        : 'text-slate-500'
                      }`}
                  >
                    {d}
                  </div>
                ))}

                {generateCalendarGrid().map((date, idx) => {
                  if (!date)
                    return (
                      <div
                        key={`empty-${idx}`}
                        className="bg-white min-h-[100px]"
                      />
                    );

                  // toLocalDateString を使用して正しい日付文字列を取得
                  const dateStr = toLocalDateString(date);
                  const isToday = toLocalDateString(new Date()) === dateStr;

                  // この日がテスト日の科目を抽出
                  const testSubjectsToday = subjects.filter(
                    (s) => s.testDate === dateStr
                  );

                  const dayTasks = schedule.filter((t) => t.date === dateStr);

                  return (
                    <div
                      key={dateStr}
                      className={`bg-white min-h-[100px] p-1 flex flex-col gap-1 relative group ${isToday ? 'bg-indigo-50/30' : ''
                        }`}
                    >
                      <div className="flex justify-between items-start">
                        <span
                          className={`text-sm w-6 h-6 flex items-center justify-center rounded-full ${isToday
                            ? 'bg-indigo-600 text-white font-bold'
                            : 'text-slate-700'
                            }`}
                        >
                          {date.getDate()}
                        </span>
                        {/* テスト日フラグ表示 */}
                        <div className="flex flex-col items-end">
                          {testSubjectsToday.map((s) => (
                            <span
                              key={s.id}
                              className="text-[10px] bg-red-100 text-red-600 px-1 rounded font-bold mb-0.5 flex items-center"
                            >
                              <Flag className="w-2 h-2 mr-0.5" />
                              {s.name}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Task Chips */}
                      <div className="space-y-1">
                        {dayTasks.map((task) => {
                          const subject = subjects.find(
                            (s) => s.id === task.subjectId
                          );
                          if (!subject) return null;

                          return (
                            <div
                              key={task.id}
                              onClick={() => {
                                if (!task.completed) {
                                  setActiveTask(task);
                                  setView('timer');
                                }
                              }}
                              className={`
                                                        text-[10px] px-1.5 py-1 rounded cursor-pointer transition flex justify-between items-center
                                                        ${task.completed
                                  ? 'bg-slate-100 text-slate-400 line-through'
                                  : subject.color
                                }
                                                        hover:brightness-95
                                                    `}
                            >
                              <span className="truncate flex-1">
                                {subject.name}
                              </span>
                              <div className="flex items-center gap-1 shrink-0">
                                {task.isFixed && (
                                  <Lock className="w-2 h-2 opacity-50" />
                                )}
                                <span>{task.plannedMinutes}m</span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteTask(task.id);
                                  }}
                                  className="hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  ×
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Timer Overlay */}
      {view === 'timer' && <TimerOverlay />}

      {/* Feedback Toast */}
      {feedback && (
        <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom duration-300">
          <div
            className={`flex items-center gap-3 p-4 rounded-xl shadow-lg border ${feedback.type === 'praise'
              ? 'bg-white border-yellow-200'
              : 'bg-white border-red-200'
              }`}
          >
            {feedback.type === 'praise' ? (
              <Smile className="text-yellow-500 w-8 h-8" />
            ) : (
              <Frown className="text-red-500 w-8 h-8" />
            )}
            <div>
              <h4
                className={`font-bold ${feedback.type === 'praise'
                  ? 'text-yellow-700'
                  : 'text-red-700'
                  }`}
              >
                {feedback.type === 'praise' ? 'Good Job!' : 'Attention!'}
              </h4>
              <p className="text-sm text-slate-600">{feedback.message}</p>
            </div>
            <button
              onClick={() => setFeedback(null)}
              className="ml-4 text-slate-400 hover:text-slate-600"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
