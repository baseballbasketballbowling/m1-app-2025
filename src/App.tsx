import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set, update, get, child } from "firebase/database";
import { 
  Trophy, Mic, Crown, Save, BarChart3, Settings, 
  ChevronRight, ChevronLeft, Eye, EyeOff, AlertCircle, 
  CheckCircle2, UserCheck, LogOut, Loader2, Users, List,
  Menu, X, LayoutDashboard, Radio, ClipboardList, Vote
} from 'lucide-react';

// ------------------------------------------------------------------
// 設定エリア
// ------------------------------------------------------------------
const APP_VERSION = "v3.5 (Admin Live View Fix)";

// あなたのFirebase設定
const firebaseConfig = {
  apiKey: "AIzaSyCvMn1srEPkKRujzDZDfpmRFJmLxwX65NE",
  authDomain: "m1-app-1e177.firebaseapp.com",
  projectId: "m1-app-1e177",
  storageBucket: "m1-app-1e177.firebasestorage.app",
  messagingSenderId: "765518236984",
  appId: "1:765518236984:web:ee6fffae3d38729a1605cd",
  databaseURL: "https://m1-app-1e177-default-rtdb.firebaseio.com"
};

// コンビ名リスト（2025年版想定）
const INITIAL_COMEDIANS = [
  { id: 1, name: "エバース" },
  { id: 2, name: "豪快キャプテン" },
  { id: 3, name: "真空ジェシカ" },
  { id: 4, name: "たくろう" },
  { id: 5, name: "ドンデコルテ" },
  { id: 6, name: "ママタルト" },
  { id: 7, name: "めぞん" },
  { id: 8, name: "ヤーレンズ" },
  { id: 9, name: "ヨネダ2000" },
  { id: 10, name: "敗者復活組" } 
];

// Firebase初期化
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const DB_ROOT = 'm1_2025_v3'; 

// ------------------------------------------------------------------
// コンポーネント実装
// ------------------------------------------------------------------

export default function App() {
  // --- User State ---
  const [user, setUser] = useState<{name: string, isAdmin: boolean} | null>(null);
  const [loginName, setLoginName] = useState("");
  const [isAdminLogin, setIsAdminLogin] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");

  // --- Game Data State ---
  const [gameState, setGameState] = useState({
    phase: 'PREDICTION', 
    currentComedianIndex: 0,
    isScoreRevealed: false,
    comedians: INITIAL_COMEDIANS,
    finalists: [] as number[],
    forceSyncTimestamp: 0, 
    revealedStatus: {} as Record<string, boolean>
  });

  // --- Local Display State (参加者用フリーズデータ) ---
  const [localDisplay, setLocalDisplay] = useState<typeof gameState | null>(null);
  
  const [scores, setScores] = useState<Record<string, Record<string, number>>>({});
  const [predictions, setPredictions] = useState<Record<string, any>>({});
  const [finalVotes, setFinalVotes] = useState<Record<string, number>>({}); 

  // --- Local UI State ---
  const [myPrediction, setMyPrediction] = useState({ first: "", second: "", third: "" });
  const [myScore, setMyScore] = useState(85);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isScoreSubmitted, setIsScoreSubmitted] = useState(false);
  const [editingName, setEditingName] = useState("");
  const [isPredictionSubmitted, setIsPredictionSubmitted] = useState(false);
  
  // 最終決戦用
  const [selectedVoteId, setSelectedVoteId] = useState<number | null>(null);
  const [isVoteSubmitted, setIsVoteSubmitted] = useState(false);
  const [showFinalistModal, setShowFinalistModal] = useState(false); 
  const [tempFinalists, setTempFinalists] = useState<number[]>([]); 

  // ★閲覧モード
  const [viewMode, setViewMode] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // 最後に処理した同期命令の時刻
  const lastSyncTimestamp = useRef(0);

  // 1. ログイン復元
  useEffect(() => {
    const saved = localStorage.getItem('m1_user_v2');
    if (saved) {
      try { setUser(JSON.parse(saved)); } catch(e) {}
    }
  }, []);

  // 2. Firebase同期 (gameStateの受信)
  useEffect(() => {
    const gameRef = ref(db, `${DB_ROOT}/gameState`);
    const scoresRef = ref(db, `${DB_ROOT}/scores`);
    const predsRef = ref(db, `${DB_ROOT}/predictions`);
    const votesRef = ref(db, `${DB_ROOT}/finalVotes`);

    const unsubGame = onValue(gameRef, (snap) => {
      const val = snap.val();
      if (val) {
        const newGameState = {
          phase: val.phase || 'PREDICTION',
          currentComedianIndex: val.currentComedianIndex || 0,
          isScoreRevealed: val.isScoreRevealed || false,
          comedians: val.comedians || INITIAL_COMEDIANS,
          finalists: val.finalists || [],
          forceSyncTimestamp: val.forceSyncTimestamp || 0,
          revealedStatus: val.revealedStatus || {}
        };
        setGameState(newGameState);

        // 初回ロード時のみ localDisplay を設定（参加者フリーズの初期値）
        setLocalDisplay(prev => {
          if (prev === null) {
            lastSyncTimestamp.current = newGameState.forceSyncTimestamp;
            return newGameState;
          }
          return prev;
        });

      } else {
        set(gameRef, {
            phase: 'PREDICTION',
            currentComedianIndex: 0,
            isScoreRevealed: false,
            comedians: INITIAL_COMEDIANS,
            finalists: [],
            forceSyncTimestamp: 0,
            revealedStatus: {}
        });
      }
    });
    const unsubScores = onValue(scoresRef, (snap) => setScores(snap.val() || {}));
    const unsubPreds = onValue(predsRef, (snap) => setPredictions(snap.val() || {}));
    const unsubVotes = onValue(votesRef, (snap) => setFinalVotes(snap.val() || {}));

    return () => { unsubGame(); unsubScores(); unsubPreds(); unsubVotes(); };
  }, []);

  // ★3. 強制同期監視 (localDisplay の更新)
  useEffect(() => {
    if (gameState.forceSyncTimestamp > lastSyncTimestamp.current) {
      console.log("Manual Sync Triggered");
      // localDisplayをgameStateの最新情報に更新
      setLocalDisplay(gameState); 
      setViewMode(null);
      setIsMenuOpen(false);
      lastSyncTimestamp.current = gameState.forceSyncTimestamp;
    }
  }, [gameState.forceSyncTimestamp, gameState]); 

  // 4. データ反映系 (localDisplayが更新されたら自分の入力状態などをリセット)
  useEffect(() => {
    if (!localDisplay) return;
    setMyScore(85);
    setIsScoreSubmitted(false);
  }, [localDisplay?.currentComedianIndex]);

  useEffect(() => {
    if (user && predictions[user.name]) {
      setMyPrediction(predictions[user.name]);
      setIsPredictionSubmitted(true);
    }
    if (user && finalVotes[user.name]) {
      setSelectedVoteId(finalVotes[user.name]);
      setIsVoteSubmitted(true);
    }
  }, [user, predictions, finalVotes]);


  // --- Actions ---

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginName.trim()) return;
    if (/[.#$[\]]/.test(loginName)) {
      alert("名前に . # $ [ ] は使えません");
      return;
    }
    if (isAdminLogin && adminPassword !== "0121") {
      alert("管理者パスワードが違います");
      return;
    }

    const nameToCheck = loginName.trim();

    // 重複チェック
    const dbRef = ref(db);
    try {
      const snapshot = await get(child(dbRef, `${DB_ROOT}/users/${nameToCheck}`));
      if (snapshot.exists()) {
        alert("その名前は既に使用されています。別の名前を入力してください。");
        return;
      }
    } catch (error) {
      console.error("Login check error:", error);
    }

    const userData = { name: nameToCheck, isAdmin: isAdminLogin };
    
    // ユーザー登録
    set(ref(db, `${DB_ROOT}/users/${nameToCheck}`), {
      joinedAt: Date.now(),
      isAdmin: isAdminLogin
    });

    setUser(userData);
    localStorage.setItem('m1_user_v2', JSON.stringify(userData));
  };

  const handleLogout = () => {
    if (confirm("ログアウトしますか？")) {
      localStorage.removeItem('m1_user_v2');
      setUser(null);
      setLoginName("");
      setAdminPassword("");
      setIsAdminLogin(false);
      setIsMenuOpen(false);
    }
  };

  const savePrediction = async () => {
    if (!user) return;
    if (!myPrediction.first || !myPrediction.second || !myPrediction.third) {
      alert("1位〜3位まですべて選択してください");
      return;
    }
    setIsSubmitting(true);
    try {
      await set(ref(db, `${DB_ROOT}/predictions/${user.name}`), {
        ...myPrediction,
        updatedAt: Date.now()
      });
      alert("予想を保存しました！");
      setIsPredictionSubmitted(true);
    } catch (error: any) {
      alert("保存失敗: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const sendScore = async () => {
    if (!user || !localDisplay) return;
    setIsSubmitting(true);
    try {
      const displayData = localDisplay || gameState;
      const safeComedians = Array.isArray(displayData.comedians) ? displayData.comedians : INITIAL_COMEDIANS;
      const current = safeComedians[displayData.currentComedianIndex] || safeComedians[0];
      
      await set(ref(db, `${DB_ROOT}/scores/${current.id}/${user.name}`), myScore);
      setIsScoreSubmitted(true);
    } catch (error: any) {
      alert("送信失敗: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const sendFinalVote = async () => {
    if (!user || !selectedVoteId) return;
    if (!confirm("投票を確定しますか？（変更できません）")) return;
    
    setIsSubmitting(true);
    try {
      await set(ref(db, `${DB_ROOT}/finalVotes/${user.name}`), selectedVoteId);
      setIsVoteSubmitted(true);
    } catch (error: any) {
      alert("送信失敗: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Admin Actions (これらはgameStateを更新する) ---
  const updateGameState = (updates: any) => {
    update(ref(db, `${DB_ROOT}/gameState`), updates);
  };

  const adminChangeComedian = (newIndex: number) => {
    const nextComedian = gameState.comedians[newIndex];
    if (!nextComedian) return;

    const nextIsRevealed = gameState.revealedStatus?.[nextComedian.id] || false;

    updateGameState({
      currentComedianIndex: newIndex,
      isScoreRevealed: nextIsRevealed, 
      phase: 'SCORING' 
    });
  };

  const adminToggleReveal = () => {
    const currentId = gameState.comedians[gameState.currentComedianIndex].id;
    const newRevealState = !gameState.isScoreRevealed;
    const updates: any = { isScoreRevealed: newRevealState };
    if (newRevealState) updates[`revealedStatus/${currentId}`] = true;
    updateGameState(updates);
  };

  const adminSaveFinalists = () => {
    if (tempFinalists.length !== 3) {
      alert("決戦に進む3組を選択してください");
      return;
    }
    updateGameState({ finalists: tempFinalists });
    setShowFinalistModal(false);
    alert("決戦の3組を保存しました");
  };

  const triggerForceSync = () => {
    if (confirm("【確認】全参加者の画面を、現在の管理者画面と同じ状態に強制変更しますか？")) {
      update(ref(db, `${DB_ROOT}/gameState`), {
        forceSyncTimestamp: Date.now()
      });
    }
  };

  const resetDatabase = async () => {
    if (!confirm("【危険】全データを消去してリセットしますか？")) return;
    await set(ref(db, `${DB_ROOT}`), {
      gameState: {
        phase: 'PREDICTION',
        currentComedianIndex: 0,
        isScoreRevealed: false,
        comedians: INITIAL_COMEDIANS,
        finalists: [],
        forceSyncTimestamp: 0,
        revealedStatus: {}
      },
      scores: {},
      predictions: {},
      finalVotes: {},
      users: {} 
    });
    alert("リセット完了");
  };

  // --- Helpers ---
  // ★表示に使用するデータソースの決定: Adminは gameState (ライブ)、Participantは localDisplay (フリーズ)
  const dataForRendering = user?.isAdmin ? gameState : (localDisplay || gameState);
  const displayData = dataForRendering; 
  
  // 安全装置: 配列チェックとインデックスチェックを厳格化
  const safeComedians = Array.isArray(displayData.comedians) ? displayData.comedians : INITIAL_COMEDIANS;
  const safeFinalists = Array.isArray(displayData.finalists) ? displayData.finalists : [];

  const safeIndex = (displayData.currentComedianIndex >= 0 && displayData.currentComedianIndex < safeComedians.length)
    ? displayData.currentComedianIndex
    : 0;

  const currentComedian = safeComedians[safeIndex];
  
  const getComedianName = (id: string | number) => {
    const c = safeComedians.find(c => String(c.id) === String(id));
    return c ? c.name : "不明";
  };

  const ranking = useMemo(() => {
    return safeComedians.map(c => {
      const cScores = scores[c.id] || {};
      const values = Object.values(cScores) as number[];
      const avg = values.length ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1) : "0.0";
      return { ...c, avg: parseFloat(avg) };
    }).sort((a, b) => b.avg - a.avg);
  }, [scores, safeComedians]);

  const finalVoteResult = useMemo(() => {
    const result: Record<number, number> = {};
    safeFinalists.forEach(id => result[id] = 0);
    Object.values(finalVotes).forEach(voteId => {
      if (result[voteId] !== undefined) result[voteId]++;
    });
    return result;
  }, [finalVotes, safeFinalists]);

  // ★最終的な表示モードの決定
  const activePhase = viewMode || displayData.phase;


  // =================================================================
  // RENDER
  // =================================================================

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-slate-900 p-8 rounded-xl border border-slate-800 shadow-2xl">
          <div className="text-center mb-8">
            <Trophy className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
            <h1 className="text-3xl font-black text-white mb-2 tracking-tighter">M-1 VOTING</h1>
            <p className="text-slate-400">Realtime Scoring App</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-slate-400 text-sm mb-1">ニックネーム</label>
              <input 
                type="text" 
                value={loginName}
                onChange={e => setLoginName(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded p-3 text-white focus:ring-2 focus:ring-yellow-500 outline-none"
                placeholder="例: 田中"
              />
            </div>
            
            <div className="pt-2">
              <label className="flex items-center gap-2 text-slate-400 text-sm cursor-pointer mb-2">
                <input 
                  type="checkbox" 
                  checked={isAdminLogin} 
                  onChange={e => {
                    setIsAdminLogin(e.target.checked);
                    setAdminPassword("");
                  }} 
                />
                管理者モード（進行操作）
              </label>
              {isAdminLogin && (
                <div className="animate-fade-in mb-4">
                  <input 
                    type="password" 
                    value={adminPassword}
                    onChange={e => setAdminPassword(e.target.value)}
                    className="w-full bg-slate-800 border border-red-800 rounded p-3 text-white focus:ring-2 focus:ring-red-500 outline-none"
                    placeholder="パスワードを入力" 
                  />
                </div>
              )}
            </div>

            <button type="submit" className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold py-3 rounded-lg transition-all transform active:scale-95">
              参加する
            </button>
          </form>
          <div className="mt-6 text-center text-slate-600 text-xs font-mono">{APP_VERSION}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-32 font-sans relative">
      
      {/* Header */}
      <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-4 py-3 flex justify-between items-center shadow-md">
        <div className="flex items-center gap-2 font-bold">
          <span className="bg-yellow-500 text-black px-1.5 py-0.5 rounded text-xs">M-1</span>
          <span>VOTING</span>
        </div>
        
        {/* ユーザーメニュー */}
        <div className="relative">
          <button 
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="flex items-center gap-2 text-sm bg-slate-800 pl-3 pr-2 py-1.5 rounded-full border border-slate-700 hover:border-slate-500 transition-colors"
          >
            <span className="font-bold">{user.name}</span>
            {user.isAdmin && <span className="text-yellow-500 text-xs">★</span>}
            {isMenuOpen ? <X size={16} /> : <Menu size={16} />}
          </button>

          {/* ドロップダウンメニュー */}
          {isMenuOpen && (
            <>
              <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setIsMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-2 w-64 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden animate-fade-in">
                <div className="p-2 space-y-1">
                  
                  {viewMode && (
                    <button 
                      onClick={() => { setViewMode(null); setIsMenuOpen(false); }}
                      className="w-full text-left px-3 py-2 text-sm text-green-400 hover:bg-slate-700 rounded flex items-center gap-2 mb-2 bg-green-900/20"
                    >
                      <LayoutDashboard size={16}/> 現在の進行に戻る
                    </button>
                  )}

                  <div className="px-3 py-1 text-[10px] text-slate-500 font-bold">開始前</div>
                  <button 
                    onClick={() => { setViewMode('PREDICTION'); setIsMenuOpen(false); }}
                    className={`w-full text-left px-3 py-2 text-sm rounded flex items-center gap-2 ${viewMode === 'PREDICTION' ? 'bg-blue-900/50 text-blue-300' : 'hover:bg-slate-700 text-slate-200'}`}
                  >
                    <Crown size={16} className="text-yellow-500"/> 3連単予想を編集
                  </button>
                  <button 
                    onClick={() => { setViewMode('PREDICTION_REVEAL'); setIsMenuOpen(false); }}
                    className={`w-full text-left px-3 py-2 text-sm rounded flex items-center gap-2 ${viewMode === 'PREDICTION_REVEAL' ? 'bg-purple-900/50 text-purple-300' : 'hover:bg-slate-700 text-slate-200'}`}
                  >
                    <List size={16} className="text-purple-400"/> みんなの予想
                  </button>

                  <div className="px-3 py-1 text-[10px] text-slate-500 font-bold mt-2">1stラウンド</div>
                  <button 
                    onClick={() => { setViewMode('SCORE_HISTORY'); setIsMenuOpen(false); }}
                    className={`w-full text-left px-3 py-2 text-sm rounded flex items-center gap-2 ${viewMode === 'SCORE_HISTORY' ? 'bg-orange-900/50 text-orange-300' : 'hover:bg-slate-700 text-slate-200'}`}
                  >
                    <ClipboardList size={16} className="text-orange-500"/> 採点結果一覧
                  </button>

                  <div className="px-3 py-1 text-[10px] text-slate-500 font-bold mt-2">最終決戦</div>
                  <button 
                    onClick={() => { setViewMode('FINAL_VOTE'); setIsMenuOpen(false); }}
                    className={`w-full text-left px-3 py-2 text-sm rounded flex items-center gap-2 ${viewMode === 'FINAL_VOTE' ? 'bg-red-900/50 text-red-300' : 'hover:bg-slate-700 text-slate-200'}`}
                  >
                    <Vote size={16} className="text-red-500"/> 投票一覧
                  </button>

                  <div className="border-t border-slate-700/50 my-2"></div>

                  <button 
                    onClick={handleLogout}
                    className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-slate-700 rounded flex items-center gap-2"
                  >
                    <LogOut size={16}/> ログアウト
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </header>

      {/* Phase Banner */}
      <div className={`text-center py-2 text-sm font-bold text-white shadow-lg transition-colors duration-300
        ${viewMode ? 'bg-slate-700' : displayData.phase === 'PREDICTION' ? 'bg-blue-600' : displayData.phase === 'PREDICTION_REVEAL' ? 'bg-purple-600' : displayData.phase === 'SCORING' ? 'bg-red-700' : displayData.phase === 'FINAL_VOTE' ? 'bg-yellow-600' : 'bg-green-600'}`}>
        
        {viewMode === 'SCORE_HISTORY' && "📊 採点結果一覧"}
        {viewMode === 'PREDICTION' && "📝 予想の確認・編集モード"}
        {viewMode === 'PREDICTION_REVEAL' && "👀 みんなの予想 確認モード"}
        {viewMode === 'FINAL_VOTE' && "🔥 最終決戦 投票状況"}
        
        {!viewMode && (
          <>
            {displayData.phase === 'PREDICTION' && "🏆 3連単予想 受付中"}
            {displayData.phase === 'PREDICTION_REVEAL' && "👀 予想発表！"}
            {displayData.phase === 'SCORING' && `🎤 No.${displayData.currentComedianIndex + 1} ${currentComedian?.name} 採点中`}
            {displayData.phase === 'FINAL_VOTE' && (
               (safeFinalists.length === 3)
               ? "🔥 最終決戦 投票受付中"
               : "⏳ 最終決戦 投票準備中"
            )}
            {displayData.phase === 'FINISHED' && "✨ 全日程終了 ✨"}
          </>
        )}
      </div>

      <main className="p-4 max-w-2xl mx-auto space-y-6">

        {/* --- SCORE HISTORY PHASE --- */}
        {activePhase === 'SCORE_HISTORY' && (
          <div className="animate-fade-in space-y-6">
            <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-xl">
              <div className="p-4 bg-slate-800/50 border-b border-slate-800 flex items-center gap-2">
                <BarChart3 className="text-orange-500" size={20}/>
                <h2 className="font-bold text-lg">採点結果一覧</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-800 text-slate-400">
                    <tr>
                      <th className="p-3 text-center w-10">#</th>
                      <th className="p-3">コンビ名</th>
                      <th className="p-3 text-center">My点</th>
                      <th className="p-3 text-center">平均</th>
                      <th className="p-3 text-center">順位</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {safeComedians.map((c, i) => {
                      const isRevealed = displayData.revealedStatus?.[c.id];
                      const myScoreVal = scores[c.id]?.[user.name];
                      const rankData = ranking.find(r => r.id === c.id);
                      const rankIndex = ranking.findIndex(r => r.id === c.id) + 1;

                      return (
                        <tr key={c.id} className="hover:bg-slate-800/50">
                          <td className="p-3 text-center text-slate-500">{i + 1}</td>
                          <td className="p-3 font-bold text-white">{c.name}</td>
                          <td className="p-3 text-center font-bold text-blue-400">
                            {myScoreVal !== undefined ? myScoreVal : "-"}
                          </td>
                          <td className="p-3 text-center font-bold text-yellow-500">
                            {isRevealed && rankData?.avg > 0 ? rankData.avg : <span className="text-slate-600">???</span>}
                          </td>
                          <td className="p-3 text-center">
                            {isRevealed && rankData?.avg > 0 ? (
                              <span className={`inline-block w-6 h-6 rounded text-xs leading-6 
                                ${rankIndex === 1 ? 'bg-yellow-500 text-black' : 
                                  rankIndex === 2 ? 'bg-slate-400 text-black' : 
                                  rankIndex === 3 ? 'bg-amber-700 text-white' : 'bg-slate-700'}`}>
                                {rankIndex}
                              </span>
                            ) : "-"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* --- PREDICTION PHASE --- */}
        {activePhase === 'PREDICTION' && (
          <div className="animate-fade-in space-y-6">
            <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-xl">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-yellow-500">
                <Crown size={24}/> 3連単予想
              </h2>
              <div className="space-y-4">
                {['優勝', '2位', '3位'].map((rank, i) => (
                  <div key={rank} className="flex items-center gap-3">
                    <span className={`w-12 font-bold ${i===0?'text-yellow-400':i===1?'text-slate-300':'text-amber-700'}`}>{rank}</span>
                    <select 
                      className="flex-1 bg-slate-800 border border-slate-700 rounded p-3 text-white focus:border-yellow-500 outline-none"
                      value={i===0?myPrediction.first:i===1?myPrediction.second:myPrediction.third}
                      onChange={(e) => {
                        setMyPrediction({...myPrediction, [i===0?'first':i===1?'second':'third']: e.target.value});
                        setIsPredictionSubmitted(false);
                      }}
                    >
                      <option value="">選択...</option>
                      {safeComedians.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <button 
                onClick={savePrediction} 
                disabled={isSubmitting}
                className="mt-6 w-full py-3 bg-yellow-500 hover:bg-yellow-400 disabled:bg-slate-700 text-black font-bold rounded-lg flex items-center justify-center gap-2 transition-all"
              >
                {isSubmitting ? <Loader2 className="animate-spin"/> : isPredictionSubmitted ? <CheckCircle2 size={20}/> : <Save size={20}/>}
                {isSubmitting ? "保存中..." : isPredictionSubmitted ? "保存済み" : "予想を保存する"}
              </button>
            </div>

            <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
              <h3 className="text-sm font-bold text-slate-400 mb-4 flex items-center gap-2">
                <Users size={16}/> 提出済みのメンバー
              </h3>
              <div className="flex flex-wrap gap-2">
                {Object.keys(predictions).length === 0 && <span className="text-slate-600 text-sm">まだ誰も提出していません</span>}
                {Object.keys(predictions).map(name => (
                  <span key={name} className="px-3 py-1 bg-slate-800 text-slate-200 rounded-full text-sm border border-slate-700 flex items-center gap-1">
                    <CheckCircle2 size={12} className="text-green-500"/> {name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* --- PREDICTION REVEAL PHASE --- */}
        {activePhase === 'PREDICTION_REVEAL' && (
          <div className="animate-fade-in space-y-6">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-black text-white mb-2 tracking-tighter text-yellow-500">みんなの予想</h2>
              <p className="text-slate-400 text-sm">誰が優勝を当てられるか？</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {Object.entries(predictions).map(([name, pred]: [string, any]) => (
                <div key={name} className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-2 opacity-10"><Crown size={60}/></div>
                  <div className="font-bold text-lg text-white mb-3 border-b border-slate-800 pb-2 flex items-center gap-2">
                    <span className="w-2 h-6 bg-blue-600 rounded-full"></span>
                    {name}
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-8 text-yellow-500 font-bold">1位</span>
                      <span className="font-bold text-white text-lg">{getComedianName(pred.first)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-8 text-slate-400 font-bold">2位</span>
                      <span className="text-slate-200">{getComedianName(pred.second)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-8 text-amber-700 font-bold">3位</span>
                      <span className="text-slate-200">{getComedianName(pred.third)}</span>
                    </div>
                  </div>
                </div>
              ))}
              {Object.keys(predictions).length === 0 && (
                <div className="col-span-2 text-center py-10 text-slate-500 bg-slate-900 rounded-xl">
                  誰も予想を提出していません
                </div>
              )}
            </div>
          </div>
        )}

        {/* --- SCORING & RESULT PHASE --- */}
        {(activePhase === 'SCORING' || activePhase === 'FINISHED') && (
          <div className="animate-fade-in space-y-6">
            {/* Comedian Card */}
            <div className="relative overflow-hidden bg-gradient-to-br from-red-900 to-slate-900 rounded-2xl p-8 text-center border border-red-900 shadow-2xl">
              <div className="absolute top-0 right-0 p-4 opacity-10"><Mic size={120}/></div>
              <div className="relative z-10">
                <div className="text-red-300 font-bold text-xs tracking-widest mb-2">ENTRY NO.{displayData.currentComedianIndex + 1}</div>
                <h2 className="text-4xl md:text-5xl font-black text-white mb-4 drop-shadow-lg tracking-tight">
                  {currentComedian?.name}
                </h2>
                {displayData.isScoreRevealed ? (
                  <div className="inline-flex items-baseline gap-2 bg-black/40 px-6 py-2 rounded-full backdrop-blur-sm border border-yellow-500/30">
                    <span className="text-sm text-slate-300">平均</span>
                    <span className="text-5xl font-black text-yellow-400">{ranking.find(c => c.id === currentComedian.id)?.avg}</span>
                    <span className="text-lg font-bold text-yellow-600">点</span>
                  </div>
                ) : (
                  <div className="h-16 flex items-center justify-center text-slate-400 text-sm animate-pulse">
                    {displayData.phase === 'SCORING' ? "審査中..." : ""}
                  </div>
                )}
              </div>
            </div>

            {!displayData.isScoreRevealed && displayData.phase === 'SCORING' && (
              <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg">
                {!isScoreSubmitted ? (
                  <>
                    <div className="text-center mb-6">
                      <div className="text-7xl font-black text-white mb-4 tabular-nums">{myScore}</div>
                      <input 
                        type="range" min="50" max="100" value={myScore} 
                        onChange={e => setMyScore(parseInt(e.target.value))}
                        className="w-full h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-yellow-500"
                      />
                      <div className="flex justify-between text-xs text-slate-500 mt-2"><span>50</span><span>100</span></div>
                    </div>
                    <button 
                      onClick={sendScore}
                      disabled={isSubmitting}
                      className="w-full py-4 bg-yellow-500 hover:bg-yellow-400 text-black font-black text-xl rounded-lg shadow-lg shadow-yellow-500/20 transform transition active:scale-95 disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2"
                    >
                      {isSubmitting ? <Loader2 className="animate-spin"/> : <Save/>}
                      {isSubmitting ? "送信中..." : "採点を確定する"}
                    </button>
                  </>
                ) : (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 bg-green-900/30 text-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                      <CheckCircle2 size={32}/>
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">採点完了</h3>
                    <p className="text-slate-400 text-sm">結果発表をお待ちください</p>
                    <button onClick={() => setIsScoreSubmitted(false)} className="mt-4 text-sm text-slate-500 hover:text-white underline">
                      修正する
                    </button>
                  </div>
                )}
              </div>
            )}

            {displayData.isScoreRevealed && (
              <div className="space-y-4">
                <div className="bg-slate-900 rounded-xl overflow-hidden border border-slate-800">
                  <div className="bg-slate-800/50 px-4 py-3 border-b border-slate-800 flex items-center gap-2 text-sm font-bold text-slate-300">
                    <BarChart3 size={16}/> 審査員別スコア
                  </div>
                  <div className="p-4 grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {Object.entries(scores[currentComedian.id] || {}).map(([name, score]) => (
                      <div key={name} className={`p-2 rounded text-center border ${name===user.name ? 'bg-slate-800 border-blue-500/50' : 'bg-slate-800 border-transparent'}`}>
                        <div className="text-[10px] text-slate-400 truncate mb-1">{name}</div>
                        <div className={`text-xl font-black ${score>=95 ? 'text-yellow-500' : score>=90 ? 'text-red-400' : 'text-white'}`}>{score}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-slate-900 rounded-xl overflow-hidden border border-slate-800">
                  <div className="bg-slate-800/50 px-4 py-3 border-b border-slate-800 flex items-center gap-2 text-sm font-bold text-slate-300">
                    <Trophy size={16}/> 現在の順位
                  </div>
                  <div className="divide-y divide-slate-800">
                    {ranking.filter(c => c.avg > 0).map((c, i) => (
                      <div key={c.id} className={`flex items-center justify-between p-3 ${c.id===currentComedian.id ? 'bg-yellow-500/5' : ''}`}>
                        <div className="flex items-center gap-3">
                          <span className={`w-6 h-6 flex items-center justify-center rounded text-xs font-bold 
                            ${i===0 ? 'bg-yellow-500 text-black' : i===1 ? 'bg-slate-400 text-black' : i===2 ? 'bg-amber-700 text-white' : 'bg-slate-800 text-slate-500'}`}>
                            {i+1}
                          </span>
                          <span className="font-bold text-sm">{c.name}</span>
                        </div>
                        <span className="font-bold text-yellow-500">{ranking.find(r => r.id === c.id)?.avg}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* --- FINAL VOTE PHASE --- */}
        {(activePhase === 'FINAL_VOTE') && (
          <div className="animate-fade-in space-y-6">
            <div className="text-center">
              <div className="inline-flex items-center gap-2 bg-yellow-500 text-black px-4 py-1 rounded-full font-bold mb-4">
                <Trophy size={16}/> 最終決戦
              </div>
              <h2 className="text-2xl font-black text-white tracking-tighter mb-6">優勝するのは誰だ</h2>
            </div>

            {/* 決戦3組の表示 & 投票 */}
            <div className="grid gap-4">
              {(!safeFinalists || safeFinalists.length === 0) && (
                <div className="text-center text-slate-500 py-10 bg-slate-900 rounded-xl border border-slate-800">
                  まだ決戦進出者が決定していません
                </div>
              )}
              
              {safeFinalists.map((id) => {
                const comedian = safeComedians.find(c => c.id === id);
                if (!comedian) return null;
                const isSelected = selectedVoteId === id;
                const voteCount = finalVoteResult[id] || 0;
                
                return (
                  <div 
                    key={id}
                    onClick={() => {
                      if (!isVoteSubmitted && !displayData.isScoreRevealed && safeFinalists.length === 3) {
                        setSelectedVoteId(id);
                      }
                    }}
                    className={`relative p-6 rounded-xl border-2 transition-all cursor-pointer overflow-hidden
                      ${isSelected 
                        ? 'bg-red-900/40 border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.3)]' 
                        : 'bg-slate-900 border-slate-700 hover:border-slate-500'}
                      ${isVoteSubmitted || displayData.isScoreRevealed || safeFinalists.length !== 3 ? 'cursor-default' : ''}
                    `}
                  >
                    <div className="flex justify-between items-center relative z-10">
                      <span className={`text-2xl font-black ${isSelected ? 'text-white' : 'text-slate-300'}`}>{comedian.name}</span>
                      {isSelected && !displayData.isScoreRevealed && <CheckCircle2 className="text-red-500" size={32}/>}
                      
                      {displayData.isScoreRevealed && (
                        <div className="flex items-end gap-2">
                          <span className="text-4xl font-black text-yellow-500">{voteCount}</span>
                          <span className="text-xs text-slate-400 mb-1">票</span>
                        </div>
                      )}
                    </div>

                    {displayData.isScoreRevealed && (
                      <div className="mt-4 pt-4 border-t border-slate-700/50 flex flex-wrap gap-2">
                        {Object.entries(finalVotes).filter(([_, vId]) => vId === id).map(([name]) => (
                          <span key={name} className="text-xs bg-slate-800 px-2 py-1 rounded text-slate-300 border border-slate-700">
                            {name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {!displayData.isScoreRevealed && safeFinalists.length === 3 && (
              <button 
                onClick={sendFinalVote}
                disabled={isSubmitting || isVoteSubmitted || !selectedVoteId}
                className={`w-full py-4 mt-4 font-black text-xl rounded-lg shadow-lg flex items-center justify-center gap-2 transition-all
                  ${isVoteSubmitted 
                    ? 'bg-slate-700 text-slate-400 cursor-not-allowed' 
                    : selectedVoteId 
                      ? 'bg-gradient-to-r from-red-600 to-red-500 hover:to-red-400 text-white shadow-red-900/50 scale-105' 
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}
              >
                {isSubmitting ? <Loader2 className="animate-spin"/> : isVoteSubmitted ? "投票済み" : "優勝者に投票する"}
              </button>
            )}

            {safeFinalists.length !== 3 && activePhase === 'FINAL_VOTE' && !user.isAdmin && (
              <div className="text-center text-slate-400 py-4 bg-slate-800 rounded-xl border border-yellow-800">
                <Loader2 className="animate-spin inline-block mr-2"/>
                管理者が決戦進出者を選出中です...
              </div>
            )}
          </div>
        )}

      </main>

      {/* --- ADMIN PANEL --- */}
      {user.isAdmin && (
        <div className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 p-4 pb-8 z-50 shadow-2xl">
          <div className="max-w-2xl mx-auto space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-red-500 flex items-center gap-1"><Settings size={12}/> ADMIN</div>
              <div className="flex bg-slate-800 rounded p-1 gap-1 overflow-x-auto">
                {/* ★全員同期ボタン：一番左に配置 */}
                <button 
                  onClick={triggerForceSync}
                  className="px-3 py-1 rounded text-xs text-green-400 bg-slate-900 hover:bg-slate-700 flex items-center gap-1 border border-slate-700 whitespace-nowrap"
                  title="全参加者の画面を現在の進行状況に強制的に戻します"
                >
                  <Radio size={12} className="animate-pulse"/> 全員同期
                </button>
                <div className="w-[1px] bg-slate-700 mx-1 h-6 self-center"></div>
                <button onClick={() => updateGameState({phase: 'PREDICTION'})} className={`px-2 py-1 rounded text-xs whitespace-nowrap ${gameState.phase==='PREDICTION' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}>予想</button>
                <button onClick={() => updateGameState({phase: 'PREDICTION_REVEAL'})} className={`px-2 py-1 rounded text-xs whitespace-nowrap ${gameState.phase==='PREDICTION_REVEAL' ? 'bg-purple-600 text-white' : 'text-slate-400'}`}>発表</button>
                <button onClick={() => updateGameState({phase: 'SCORING'})} className={`px-2 py-1 rounded text-xs whitespace-nowrap ${gameState.phase==='SCORING' ? 'bg-red-600 text-white' : 'text-slate-400'}`}>採点</button>
                <button onClick={() => updateGameState({phase: 'FINAL_VOTE', isScoreRevealed: false})} className={`px-2 py-1 rounded text-xs whitespace-nowrap ${gameState.phase==='FINAL_VOTE' ? 'bg-yellow-600 text-white' : 'text-slate-400'}`}>投票</button>
              </div>
            </div>

            {/* フェーズごとの操作パネル切り替え */}
            {gameState.phase === 'SCORING' ? (
              <div className="flex items-center gap-2">
                <button onClick={() => adminChangeComedian(Math.max(0, gameState.currentComedianIndex - 1))} className="p-3 bg-slate-800 rounded-lg hover:bg-slate-700 text-white"><ChevronLeft/></button>
                <button onClick={adminToggleReveal} className={`flex-1 py-3 font-bold rounded-lg flex items-center justify-center gap-2 transition-colors ${gameState.isScoreRevealed ? 'bg-slate-800 text-slate-300' : 'bg-red-600 hover:bg-red-500 text-white'}`}>
                  {gameState.isScoreRevealed ? <><EyeOff size={18}/> CLOSE</> : <><Eye size={18}/> 結果オープン</>}
                </button>
                <button onClick={() => {
                  if (gameState.currentComedianIndex < 9) adminChangeComedian(gameState.currentComedianIndex + 1);
                  else updateGameState({phase: 'FINISHED'});
                }} className="p-3 bg-slate-800 rounded-lg hover:bg-slate-700 text-white"><ChevronRight/></button>
              </div>
            ) : gameState.phase === 'FINAL_VOTE' ? (
              <div className="space-y-2">
                <button 
                  onClick={() => setShowFinalistModal(true)}
                  className="w-full py-2 bg-slate-800 border border-slate-700 hover:border-yellow-500 text-yellow-500 rounded text-sm font-bold"
                >
                  決戦に進んだ3組を選ぶ
                </button>
                <button 
                  onClick={() => updateGameState({isScoreRevealed: !gameState.isScoreRevealed})}
                  className={`w-full py-3 font-bold rounded-lg flex items-center justify-center gap-2 transition-colors ${gameState.isScoreRevealed ? 'bg-slate-800 text-slate-300' : 'bg-red-600 hover:bg-red-500 text-white'}`}
                >
                  {gameState.isScoreRevealed ? <><EyeOff size={18}/> 投票結果を隠す</> : <><Eye size={18}/> 投票結果オープン</>}
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                {gameState.comedians && gameState.comedians[gameState.currentComedianIndex]?.id === 10 && (
                  <div className="flex-1 flex gap-1">
                    <input type="text" className="w-full bg-slate-800 text-white text-xs px-2 rounded" placeholder="敗者復活組" value={editingName} onChange={e => setEditingName(e.target.value)}/>
                    <button onClick={() => {
                      const newComedians = [...(gameState.comedians || INITIAL_COMEDIANS)];
                      newComedians[gameState.currentComedianIndex].name = editingName;
                      updateGameState({comedians: newComedians});
                      setEditingName("");
                    }} className="bg-blue-600 text-white text-xs px-2 rounded">更新</button>
                  </div>
                )}
              </div>
            )}

            <button onClick={resetDatabase} className="w-full mt-2 text-xs text-slate-600 hover:text-red-500 py-1">データリセット</button>
          </div>
        </div>
      )}

      {/* 決戦3組選択モーダル */}
      {showFinalistModal && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 w-full max-w-sm rounded-xl border border-slate-700 p-6 space-y-4">
            <h3 className="text-xl font-bold text-white text-center">決戦の3組を選択</h3>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {safeComedians.map(c => {
                const isSelected = tempFinalists.includes(c.id);
                return (
                  <div 
                    key={c.id}
                    onClick={() => {
                      if (isSelected) {
                        setTempFinalists(prev => prev.filter(id => id !== c.id));
                      } else if (tempFinalists.length < 3) {
                        setTempFinalists(prev => [...prev, c.id]);
                      }
                    }}
                    className={`p-3 rounded border cursor-pointer flex justify-between items-center
                      ${isSelected ? 'bg-yellow-900/30 border-yellow-500 text-yellow-500' : 'bg-slate-800 border-slate-700 text-slate-300'}`}
                  >
                    <span>{c.name}</span>
                    {isSelected && <CheckCircle2 size={16}/>}
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowFinalistModal(false)} className="flex-1 py-2 bg-slate-800 rounded text-slate-400">キャンセル</button>
              <button onClick={adminSaveFinalists} className="flex-1 py-2 bg-yellow-600 hover:bg-yellow-500 text-white font-bold rounded">決定</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
