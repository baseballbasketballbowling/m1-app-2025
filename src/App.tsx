import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set, update, push, child } from "firebase/database";
import { 
  Trophy, Mic, Crown, Save, BarChart3, Settings, 
  ChevronRight, ChevronLeft, Eye, EyeOff, AlertCircle, 
  CheckCircle2, UserCheck, LogOut, Loader2, Users 
} from 'lucide-react';

// ------------------------------------------------------------------
// 設定エリア
// ------------------------------------------------------------------
const APP_VERSION = "v2.0 (Stable)";

// あなたのFirebase設定
const firebaseConfig = {
  apiKey: "AIzaSyCvMn1srEPkKRujzDZDfpmRFJmLxwX65NE",
  authDomain: "m1-app-1e177.firebaseapp.com",
  projectId: "m1-app-1e177",
  storageBucket: "m1-app-1e177.firebasestorage.app",
  messagingSenderId: "765518236984",
  appId: "1:765518236984:web:ee6fffae3d38729a1605cd",
  databaseURL: "https://m1-app-1e177-default-rtdb.firebaseio.com/"
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
const DB_ROOT = 'm1_2025_v2'; // バージョンを変えてデータをクリーンにする

// ------------------------------------------------------------------
// コンポーネント実装
// ------------------------------------------------------------------

export default function App() {
  // --- User State ---
  const [user, setUser] = useState<{name: string, isAdmin: boolean} | null>(null);
  const [loginName, setLoginName] = useState("");
  const [isAdminLogin, setIsAdminLogin] = useState(false);

  // --- Game Data State ---
  const [gameState, setGameState] = useState({
    phase: 'PREDICTION', // PREDICTION | SCORING | FINISHED
    currentComedianIndex: 0,
    isScoreRevealed: false,
    comedians: INITIAL_COMEDIANS,
  });
  
  const [scores, setScores] = useState<Record<string, Record<string, number>>>({});
  const [predictions, setPredictions] = useState<Record<string, any>>({});

  // --- Local UI State ---
  const [myPrediction, setMyPrediction] = useState({ first: "", second: "", third: "" });
  const [myScore, setMyScore] = useState(85);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isScoreSubmitted, setIsScoreSubmitted] = useState(false);
  const [editingName, setEditingName] = useState("");

  // 1. ログイン復元 & Firebase同期
  useEffect(() => {
    // ログイン復元
    const saved = localStorage.getItem('m1_user_v2');
    if (saved) {
      try { setUser(JSON.parse(saved)); } catch(e) {}
    }

    // データ同期リスナー
    const gameRef = ref(db, `${DB_ROOT}/gameState`);
    const scoresRef = ref(db, `${DB_ROOT}/scores`);
    const predsRef = ref(db, `${DB_ROOT}/predictions`);

    const unsubGame = onValue(gameRef, (snap) => {
      const val = snap.val();
      if (val) setGameState(val);
    });
    const unsubScores = onValue(scoresRef, (snap) => setScores(snap.val() || {}));
    const unsubPreds = onValue(predsRef, (snap) => setPredictions(snap.val() || {}));

    return () => { unsubGame(); unsubScores(); unsubPreds(); };
  }, []);

  // 2. 自分の予想データの反映
  useEffect(() => {
    if (user && predictions[user.name]) {
      setMyPrediction(predictions[user.name]);
    }
  }, [user, predictions]);

  // 3. コンビ切り替え時のリセット
  useEffect(() => {
    setMyScore(85);
    setIsScoreSubmitted(false);
  }, [gameState.currentComedianIndex]);


  // --- Actions ---

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginName.trim()) return;
    // 禁止文字チェック
    if (/[.#$[\]]/.test(loginName)) {
      alert("名前に . # $ [ ] は使えません");
      return;
    }
    const userData = { name: loginName.trim(), isAdmin: isAdminLogin };
    setUser(userData);
    localStorage.setItem('m1_user_v2', JSON.stringify(userData));
  };

  const handleLogout = () => {
    if (confirm("ログアウトしますか？")) {
      localStorage.removeItem('m1_user_v2');
      setUser(null);
      setLoginName("");
    }
  };

  // 予想を保存
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
    } catch (error: any) {
      alert("保存失敗: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 採点を送信
  const sendScore = async () => {
    if (!user) return;
    setIsSubmitting(true);
    try {
      const comedianId = gameState.comedians[gameState.currentComedianIndex].id;
      await set(ref(db, `${DB_ROOT}/scores/${comedianId}/${user.name}`), myScore);
      setIsScoreSubmitted(true);
    } catch (error: any) {
      alert("送信失敗: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Admin Actions ---
  const updateGameState = (updates: any) => {
    update(ref(db, `${DB_ROOT}/gameState`), updates);
  };

  const resetDatabase = async () => {
    if (!confirm("【危険】全データを消去してリセットしますか？")) return;
    await set(ref(db, `${DB_ROOT}`), {
      gameState: {
        phase: 'PREDICTION',
        currentComedianIndex: 0,
        isScoreRevealed: false,
        comedians: INITIAL_COMEDIANS
      },
      scores: {},
      predictions: {}
    });
    alert("リセット完了");
  };

  // --- Helpers ---
  const currentComedian = gameState.comedians[gameState.currentComedianIndex];
  
  // ランキング計算
  const ranking = useMemo(() => {
    return gameState.comedians.map(c => {
      const cScores = scores[c.id] || {};
      const values = Object.values(cScores) as number[];
      const avg = values.length ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1) : "0.0";
      return { ...c, avg: parseFloat(avg) };
    }).sort((a, b) => b.avg - a.avg);
  }, [scores, gameState.comedians]);


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
            <label className="flex items-center gap-2 text-slate-400 text-sm cursor-pointer">
              <input type="checkbox" checked={isAdminLogin} onChange={e => setIsAdminLogin(e.target.checked)} />
              管理者モード（進行操作）
            </label>
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
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-32 font-sans">
      
      {/* Header */}
      <header className="sticky top-0 z-20 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 py-3 flex justify-between items-center shadow-md">
        <div className="flex items-center gap-2 font-bold">
          <span className="bg-yellow-500 text-black px-1.5 py-0.5 rounded text-xs">M-1</span>
          <span>VOTING</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="bg-slate-800 px-3 py-1 rounded-full border border-slate-700 flex items-center gap-1">
            {user.name} {user.isAdmin && <span className="text-yellow-500">★</span>}
          </span>
          <button onClick={handleLogout} className="text-slate-500 hover:text-white"><LogOut size={18}/></button>
        </div>
      </header>

      {/* Phase Banner */}
      <div className={`text-center py-2 text-sm font-bold text-white shadow-lg transition-colors duration-300
        ${gameState.phase === 'PREDICTION' ? 'bg-blue-600' : gameState.phase === 'SCORING' ? 'bg-red-700' : 'bg-green-600'}`}>
        {gameState.phase === 'PREDICTION' && "🏆 3連単予想 受付中"}
        {gameState.phase === 'SCORING' && `🎤 No.${gameState.currentComedianIndex + 1} ${currentComedian?.name} 採点中`}
        {gameState.phase === 'FINISHED' && "✨ 全日程終了 ✨"}
      </div>

      <main className="p-4 max-w-2xl mx-auto space-y-6">

        {/* --- PREDICTION PHASE --- */}
        {gameState.phase === 'PREDICTION' && (
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
                      onChange={(e) => setMyPrediction({...myPrediction, [i===0?'first':i===1?'second':'third']: e.target.value})}
                    >
                      <option value="">選択...</option>
                      {gameState.comedians.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <button 
                onClick={savePrediction} 
                disabled={isSubmitting}
                className="mt-6 w-full py-3 bg-yellow-500 hover:bg-yellow-400 disabled:bg-slate-700 text-black font-bold rounded-lg flex items-center justify-center gap-2 transition-all"
              >
                {isSubmitting ? <Loader2 className="animate-spin"/> : <Save size={20}/>}
                {isSubmitting ? "保存中..." : "予想を保存する"}
              </button>
            </div>

            {/* Participants List */}
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

        {/* --- SCORING & RESULT PHASE --- */}
        {(gameState.phase === 'SCORING' || gameState.phase === 'FINISHED') && (
          <div className="animate-fade-in space-y-6">
            
            {/* Comedian Card */}
            <div className="relative overflow-hidden bg-gradient-to-br from-red-900 to-slate-900 rounded-2xl p-8 text-center border border-red-900 shadow-2xl">
              <div className="absolute top-0 right-0 p-4 opacity-10"><Mic size={120}/></div>
              <div className="relative z-10">
                <div className="text-red-300 font-bold text-xs tracking-widest mb-2">ENTRY NO.{gameState.currentComedianIndex + 1}</div>
                <h2 className="text-4xl md:text-5xl font-black text-white mb-4 drop-shadow-lg tracking-tight">
                  {currentComedian?.name}
                </h2>
                {gameState.isScoreRevealed ? (
                  <div className="inline-flex items-baseline gap-2 bg-black/40 px-6 py-2 rounded-full backdrop-blur-sm border border-yellow-500/30">
                    <span className="text-sm text-slate-300">平均</span>
                    <span className="text-5xl font-black text-yellow-400">{ranking.find(c => c.id === currentComedian.id)?.avg}</span>
                    <span className="text-lg font-bold text-yellow-600">点</span>
                  </div>
                ) : (
                  <div className="h-16 flex items-center justify-center text-slate-400 text-sm animate-pulse">
                    {gameState.phase === 'SCORING' ? "審査中..." : ""}
                  </div>
                )}
              </div>
            </div>

            {/* Input Area */}
            {!gameState.isScoreRevealed && gameState.phase === 'SCORING' && (
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

            {/* Result Area */}
            {gameState.isScoreRevealed && (
              <div className="space-y-4">
                {/* Score Grid */}
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

                {/* Ranking Table */}
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
                        <span className="font-bold text-yellow-500">{c.avg}</span>
                      </div>
                    ))}
                  </div>
                </div>
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
              <div className="flex bg-slate-800 rounded p-1">
                <button 
                  onClick={() => updateGameState({phase: 'PREDICTION'})}
                  className={`px-3 py-1 rounded text-xs ${gameState.phase==='PREDICTION' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}
                >予想</button>
                <button 
                  onClick={() => updateGameState({phase: 'SCORING'})}
                  className={`px-3 py-1 rounded text-xs ${gameState.phase==='SCORING' ? 'bg-red-600 text-white' : 'text-slate-400'}`}
                >採点</button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button 
                onClick={() => updateGameState({
                  currentComedianIndex: Math.max(0, gameState.currentComedianIndex - 1),
                  isScoreRevealed: false
                })}
                className="p-3 bg-slate-800 rounded-lg hover:bg-slate-700 text-white"
              ><ChevronLeft/></button>

              {gameState.phase === 'SCORING' ? (
                <button 
                  onClick={() => updateGameState({isScoreRevealed: !gameState.isScoreRevealed})}
                  className={`flex-1 py-3 font-bold rounded-lg flex items-center justify-center gap-2 transition-colors
                    ${gameState.isScoreRevealed ? 'bg-slate-800 text-slate-300' : 'bg-red-600 hover:bg-red-500 text-white'}`}
                >
                  {gameState.isScoreRevealed ? <><EyeOff size={18}/> CLOSE</> : <><Eye size={18}/> 結果オープン</>}
                </button>
              ) : (
                <div className="flex-1 bg-slate-800 rounded-lg flex items-center justify-center text-xs text-slate-500">
                  予想フェーズ中
                </div>
              )}

              <button 
                onClick={() => {
                  if (gameState.currentComedianIndex < 9) {
                    updateGameState({
                      currentComedianIndex: gameState.currentComedianIndex + 1,
                      isScoreRevealed: false,
                      phase: 'SCORING'
                    });
                  } else {
                    updateGameState({phase: 'FINISHED'});
                  }
                }}
                className="p-3 bg-slate-800 rounded-lg hover:bg-slate-700 text-white"
              ><ChevronRight/></button>
            </div>

            {/* 敗者復活編集 */}
            {gameState.comedians[gameState.currentComedianIndex].id === 10 && (
              <div className="flex gap-2 pt-2 border-t border-slate-800">
                <input 
                  type="text" 
                  className="flex-1 bg-slate-800 text-white text-sm px-3 py-2 rounded"
                  placeholder="敗者復活組の名前を入力"
                  value={editingName}
                  onChange={e => setEditingName(e.target.value)}
                />
                <button 
                  onClick={() => {
                    const newComedians = [...gameState.comedians];
                    newComedians[gameState.currentComedianIndex].name = editingName;
                    updateGameState({comedians: newComedians});
                    setEditingName("");
                  }}
                  className="bg-blue-600 text-white text-xs px-3 rounded font-bold"
                >更新</button>
              </div>
            )}

            <button onClick={resetDatabase} className="w-full mt-2 text-xs text-slate-600 hover:text-red-500 py-1">
              データリセット（管理者のみ）
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
