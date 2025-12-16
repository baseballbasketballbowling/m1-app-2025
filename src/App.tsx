import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set, update, get, child, remove } from "firebase/database";
import { 
  Trophy, Mic, Crown, Save, BarChart3, Settings, 
  ChevronRight, ChevronLeft, Eye, EyeOff, AlertCircle, 
  CheckCircle2, UserCheck, LogOut, Loader2, Users, List,
  Menu, X, LayoutDashboard, Radio, ClipboardList, Vote, UserMinus, UserX, UserCog,
  TrendingUp, Award
} from 'lucide-react';

// ------------------------------------------------------------------
// 設定エリア
// ------------------------------------------------------------------
const APP_VERSION = "v3.28 (Official Score Sync Fix)";

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
  const [userPassword, setUserPassword] = useState(""); 
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
    revealedStatus: {} as Record<string, boolean>,
    officialScores: {} as Record<string, number | null>
  });

  // --- Local Display State (参加者用フリーズデータ) ---
  const [localDisplay, setLocalDisplay] = useState<typeof gameState | null>(null);
  
  const [scores, setScores] = useState<Record<string, Record<string, number>>>({});
  const [predictions, setPredictions] = useState<Record<string, any>>({});
  const [finalVotes, setFinalVotes] = useState<Record<string, number>>({}); 
  
  // ★ユーザー管理用データ
  const [allAuthUsers, setAllAuthUsers] = useState<Record<string, any>>({});
  const [activeSessionUsers, setActiveSessionUsers] = useState<Record<string, any>>({});
  const [logoutCommands, setLogoutCommands] = useState<Record<string, any>>({}); 

  // --- Local UI State ---
  const [myPrediction, setMyPrediction] = useState({ first: "", second: "", third: "" });
  const [myScore, setMyScore] = useState(85);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isScoreSubmitted, setIsScoreSubmitted] = useState(false);
  const [editingName, setEditingName] = useState("");
  const [isPredictionSubmitted, setIsPredictionSubmitted] = useState(false);
  
  // 採点一覧ソート用
  const [sortBy, setSortBy] = useState<'id' | 'my' | 'avg' | 'official'>('official');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // 最終決戦用
  const [selectedVoteId, setSelectedVoteId] = useState<number | null>(null);
  const [isVoteSubmitted, setIsVoteSubmitted] = useState(false);
  const [showFinalistModal, setShowFinalistModal] = useState(false); 
  const [showResetModal, setShowResetModal] = useState(false);
  const [tempFinalists, setTempFinalists] = useState<number[]>([]); 
  const [adminOfficialScore, setAdminOfficialScore] = useState<string>('');

  // ★閲覧モード
  const [viewMode, setViewMode] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // コンビ詳細ページ表示用
  const [detailComedianId, setDetailComedianId] = useState<number | null>(null); 

  // ★ニックネーム変更用
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [newNickname, setNewNickname] = useState("");
  
  // 最後に処理した同期命令の時刻
  const lastSyncTimestamp = useRef(0);

  // 1. ログイン復元
  useEffect(() => {
    const saved = localStorage.getItem('m1_user_v2');
    if (saved) {
      try { setUser(JSON.parse(saved)); } catch(e) {}
    }
  }, []);
  
  // 2. Firebase同期
  useEffect(() => {
    const gameRef = ref(db, `${DB_ROOT}/gameState`);
    const scoresRef = ref(db, `${DB_ROOT}/scores`);
    const predsRef = ref(db, `${DB_ROOT}/predictions`);
    const votesRef = ref(db, `${DB_ROOT}/finalVotes`);
    const authRef = ref(db, `${DB_ROOT}/auth`);
    const usersRef = ref(db, `${DB_ROOT}/users`);
    const logoutCommandRef = ref(db, `${DB_ROOT}/userLogoutCommands`); 

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
          revealedStatus: val.revealedStatus || {},
          officialScores: val.officialScores || {}
        };
        setGameState(newGameState);

        // 初回ロード時のみ localDisplay を設定
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
            revealedStatus: {},
            officialScores: {}
        });
      }
    });
    
    const unsubAuth = onValue(authRef, (snap) => setAllAuthUsers(snap.val() || {}));
    const unsubUsers = onValue(usersRef, (snap) => setActiveSessionUsers(snap.val() || {}));
    const unsubLogoutCommands = onValue(logoutCommandRef, (snap) => setLogoutCommands(snap.val() || {}));

    const unsubScores = onValue(scoresRef, (snap) => setScores(snap.val() || {}));
    const unsubPreds = onValue(predsRef, (snap) => setPredictions(snap.val() || {}));
    const unsubVotes = onValue(votesRef, (snap) => setFinalVotes(snap.val() || {}));

    return () => { 
        unsubGame(); 
        unsubScores(); 
        unsubPreds(); 
        unsubVotes(); 
        unsubAuth();
        unsubUsers();
        unsubLogoutCommands();
    };
  }, []);

  // ★3. 強制同期監視
  useEffect(() => {
    if (gameState.forceSyncTimestamp > lastSyncTimestamp.current) {
      setLocalDisplay(gameState); 
      setViewMode(null);
      setIsMenuOpen(false);
      lastSyncTimestamp.current = gameState.forceSyncTimestamp;
      setDetailComedianId(null);
    }
  }, [gameState.forceSyncTimestamp, gameState]); 

  // ★4. 強制ログアウトコマンド監視
  useEffect(() => {
    if (user?.name && logoutCommands[user.name]) {
      console.log(`[LOGOUT COMMAND] Received command for user: ${user.name}`);
      localStorage.removeItem('m1_user_v2');
      remove(ref(db, `${DB_ROOT}/userLogoutCommands/${user.name}`));
      setUser(null);
      alert(`管理者の操作により、強制的にログアウトされました。`);
    }
  }, [user?.name, logoutCommands]); 


  // 5. データ反映系
  useEffect(() => {
    if (!localDisplay) return;
    setMyScore(85);
    setIsScoreSubmitted(false);
    
    if (user?.isAdmin) {
      const currentId = localDisplay.comedians[localDisplay.currentComedianIndex]?.id;
      if (currentId) {
        setAdminOfficialScore(String(localDisplay.officialScores[currentId] || ''));
      }
    }
  }, [localDisplay?.currentComedianIndex, user?.isAdmin]);

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

    if (!userPassword.trim() && !isAdminLogin) {
        alert("パスワードを入力してください。");
        return;
    }
    if (/[.#$[\]]/.test(loginName)) {
      alert("名前に . # $ [ ] は使えません");
      return;
    }
    
    const nameToCheck = loginName.trim();
    
    const authSnapshot = await get(child(ref(db), `${DB_ROOT}/auth/${nameToCheck}`));
    const isNewUser = !authSnapshot.exists();

    if (isAdminLogin) {
      if (adminPassword !== "0121") {
        alert("管理者パスワードが違います");
        return;
      }
    }

    const sessionSnapshot = await get(child(ref(db), `${DB_ROOT}/users/${nameToCheck}`));
    if (sessionSnapshot.exists()) {
        alert("その名前は既に他のセッションで使用されています。");
        return;
    }
    
    if (!isAdminLogin) {
        if (isNewUser) {
            if (!confirm(`「${nameToCheck}」で新規ユーザー登録します。\nパスワード: ${userPassword} でよろしいですか？`)) {
                return;
            }
            await set(ref(db, `${DB_ROOT}/auth/${nameToCheck}`), { 
                password: userPassword.trim(),
                isAdmin: false
            });
        } else {
            if (authSnapshot.val()?.password !== userPassword.trim()) {
                alert("パスワードが違います。");
                return;
            }
        }
    }
    
    const userData = { name: nameToCheck, isAdmin: isAdminLogin };
    
    set(ref(db, `${DB_ROOT}/users/${nameToCheck}`), {
      joinedAt: Date.now(),
      isAdmin: isAdminLogin
    });

    setUser(userData);
    localStorage.setItem('m1_user_v2', JSON.stringify(userData));

    if (!predictions[nameToCheck]) {
      setViewMode('PREDICTION');
    }
  };

  const handleLogout = () => {
    if (confirm("ログアウトしますか？")) {
      if (user?.name) {
          remove(ref(db, `${DB_ROOT}/users/${user.name}`));
      }
      localStorage.removeItem('m1_user_v2');
      setUser(null);
      setLoginName("");
      setUserPassword(""); 
      setAdminPassword("");
      setIsAdminLogin(false);
      setIsMenuOpen(false);
    }
  };

  const handleNicknameChange = async () => {
    if (!user) return;
    if (!newNickname.trim()) return;
    if (/[.#$[\]]/.test(newNickname)) {
        alert("名前に . # $ [ ] は使えません");
        return;
    }
    if (newNickname === user.name) {
        setShowNicknameModal(false);
        return;
    }

    const snapshotAuth = await get(child(ref(db), `${DB_ROOT}/auth/${newNickname}`));
    const snapshotUser = await get(child(ref(db), `${DB_ROOT}/users/${newNickname}`));
    if (snapshotAuth.exists() || snapshotUser.exists()) {
        alert("その名前は既に使用されています");
        return;
    }

    if (!confirm(`ニックネームを「${user.name}」から「${newNickname}」に変更しますか？\n過去のデータ（予想、採点、投票）は全て引き継がれます。`)) return;

    const oldName = user.name;
    const root = DB_ROOT;
    const updates: Record<string, any> = {};

    updates[`${root}/auth/${newNickname}`] = allAuthUsers[oldName];
    updates[`${root}/auth/${oldName}`] = null;
    updates[`${root}/users/${newNickname}`] = activeSessionUsers[oldName];
    updates[`${root}/users/${oldName}`] = null;

    if (predictions[oldName]) {
        updates[`${root}/predictions/${newNickname}`] = { ...predictions[oldName], name: newNickname };
        updates[`${root}/predictions/${oldName}`] = null;
    }
    if (finalVotes[oldName]) {
        updates[`${root}/finalVotes/${newNickname}`] = finalVotes[oldName];
        updates[`${root}/finalVotes/${oldName}`] = null;
    }
    Object.keys(scores).forEach(comedianId => {
        if (scores[comedianId] && scores[comedianId][oldName] !== undefined) {
            updates[`${root}/scores/${comedianId}/${newNickname}`] = scores[comedianId][oldName];
            updates[`${root}/scores/${comedianId}/${oldName}`] = null;
        }
    });

    try {
        await update(ref(db), updates);
        
        const newUser = { ...user, name: newNickname };
        setUser(newUser);
        setLoginName(newNickname); 
        localStorage.setItem('m1_user_v2', JSON.stringify(newUser));
        
        alert("ニックネームを変更しました！");
        setShowNicknameModal(false);
        setNewNickname("");
        setIsMenuOpen(false);

    } catch(e: any) {
        console.error(e);
        alert("変更に失敗しました: " + e.message);
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
    // ★修正: dataForRendering を使用して、管理者もユーザーも現在表示中のコンビIDを正しく取得
    const displayData = user?.isAdmin ? gameState : (localDisplay || gameState);
    if (!user || !displayData) return;

    setIsSubmitting(true);
    try {
      const safeComedians = Array.isArray(displayData.comedians) ? displayData.comedians : INITIAL_COMEDIANS;
      const current = safeComedians[displayData.currentComedianIndex] || safeComedians[0];
      
      // IDがundefinedでないことを確認
      if (!current || current.id === undefined) {
          throw new Error("コンビデータが不正です");
      }
      
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

  // --- Admin Actions ---
  const updateGameState = (updates: any) => {
    update(ref(db, `${DB_ROOT}/gameState`), updates);
  };

  const adminChangeComedian = (newIndex: number) => {
    const nextComedian = gameState.comedians[newIndex];
    if (!nextComedian) return;

    const nextIsRevealed = gameState.revealedStatus?.[nextComedian.id] || false;

    // 強制同期命令を削除
    updateGameState({ 
      currentComedianIndex: newIndex,
      isScoreRevealed: nextIsRevealed, 
      phase: 'SCORING' 
    });
  };

  const adminToggleReveal = () => {
    const currentId = gameState.comedians[gameState.currentComedianIndex].id;
    const newRevealState = !gameState.isScoreRevealed;
    
    const updates: any = { 
      isScoreRevealed: newRevealState,
      forceSyncTimestamp: Date.now() 
    };
    
    if (newRevealState) {
      updates[`revealedStatus/${currentId}`] = true;
    }
    
    updateGameState(updates); 
  };

  const adminSaveFinalists = () => {
    if (tempFinalists.length !== 3) {
      alert("決戦に進む3組を選択してください");
      return;
    }
    const updates = { 
      finalists: tempFinalists,
      forceSyncTimestamp: Date.now()
    };
    updateGameState(updates);
    setShowFinalistModal(false);
    alert("決戦の3組を保存しました");
  };

  const adminSaveOfficialScore = () => {
    if (!adminOfficialScore || isNaN(Number(adminOfficialScore))) {
      alert("有効な合計得点を入力してください。");
      return;
    }
    const currentComedianId = gameState.comedians[gameState.currentComedianIndex]?.id;
    if (!currentComedianId) return;

    const newScore = Number(adminOfficialScore);
    
    // ★修正: 得点確定時に forceSyncTimestamp も更新して参加者に即座に反映させる
    update(ref(db, `${DB_ROOT}/gameState`), {
      [`officialScores/${currentComedianId}`]: newScore,
      forceSyncTimestamp: Date.now()
    });
    
    alert(`プロ審査員得点 (${newScore}点) を保存し、参加者に公開しました。`);
  };

  const adminDeleteUser = async (name: string) => {
    if (!user?.isAdmin || !confirm(`ユーザー「${name}」の認証情報とセッションを完全に削除します。よろしいですか？`)) return;
    try {
        await remove(ref(db, `${DB_ROOT}/auth/${name}`));
        await remove(ref(db, `${DB_ROOT}/users/${name}`));
        if (activeSessionUsers[name]) {
             await set(ref(db, `${DB_ROOT}/userLogoutCommands/${name}`), true);
        }
        alert(`ユーザー「${name}」を完全に削除しました。`);
    } catch (e) {
        alert("削除に失敗しました。");
        console.error("User deletion failed:", e);
    }
  };

  const adminForceLogout = async (name: string) => {
    if (!user?.isAdmin || !confirm(`ユーザー「${name}」のセッションを強制的に終了させます。よろしいですか？`)) return;
    try {
        await remove(ref(db, `${DB_ROOT}/users/${name}`));
        await set(ref(db, `${DB_ROOT}/userLogoutCommands/${name}`), Date.now()); 

        alert(`ユーザー「${name}」を強制ログアウトさせました。`);
    } catch (e) {
        alert("強制ログアウトに失敗しました。");
        console.error("Force logout failed:", e);
    }
  };

  const triggerForceSync = () => {
    if (confirm("【確認】全参加者の画面を、現在の管理者画面と同じ状態に強制変更しますか？")) {
      update(ref(db, `${DB_ROOT}/gameState`), {
        forceSyncTimestamp: Date.now()
      });
    }
  };

  const executeDatabaseReset = async (type: 'all' | 'scores_only' | 'predictions_only') => {
      const baseUpdates: Record<string, any> = {
          'gameState/officialScores': {},
          'gameState/revealedStatus': {},
          'gameState/currentComedianIndex': 0,
          'gameState/isScoreRevealed': false,
          'gameState/phase': 'PREDICTION',
          'gameState/finalists': [],
          'gameState/forceSyncTimestamp': Date.now(),
      };
      
      try {
          if (type === 'all') {
              if (!confirm("【危険】全データ（ユーザー認証、採点、予想、セッション）を消去してリセットしますか？")) return;
              await set(ref(db, `${DB_ROOT}`), {
                gameState: { ...baseUpdates, comedians: INITIAL_COMEDIANS, forceSyncTimestamp: Date.now() },
                scores: {},
                predictions: {},
                finalVotes: {},
                users: {},
                auth: {},
                userLogoutCommands: {}
              });
              alert("全データリセット完了");
          } else if (type === 'scores_only') {
              if (!confirm("採点データ（1stラウンドの採点結果、最終投票結果、公式得点、進行状況）のみを消去します。よろしいですか？\n(予想とユーザー情報は保持されます)")) return;
              
              const updates: Record<string, any> = {
                scores: {},
                finalVotes: {},
                ...baseUpdates,
                'gameState/comedians': INITIAL_COMEDIANS
              };

              await update(ref(db, `${DB_ROOT}`), updates);
              alert("採点データのみをリセット完了しました。");
          } else if (type === 'predictions_only') {
              if (!confirm("予想データのみを消去します。よろしいですか？\n(採点結果、ユーザー情報は保持されます)")) return;

              const updates: Record<string, any> = {
                predictions: {},
                'gameState/forceSyncTimestamp': Date.now(),
              };

              await update(ref(db, `${DB_ROOT}`), updates);
              alert("予想データのみをリセット完了しました。");
          }
      } catch(e) {
          alert(`リセット中にエラーが発生しました: ${e}`);
      } finally {
          setShowResetModal(false);
      }
  };


  // --- Helpers ---
  const dataForRendering = user?.isAdmin ? gameState : (localDisplay || gameState);
  const displayData = dataForRendering; 
  
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

  // ★ソート機能を統合
  const ranking = useMemo(() => {
    const list = safeComedians.map(c => {
      const cScores = scores[c.id] || {};
      const values = Object.values(cScores) as number[];
      const avg = values.length ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1) : "0.0";
      const myScore = cScores[user?.name || ''] || 0;
      const officialScore = displayData.officialScores[c.id] || 0;
      const isRevealed = displayData.revealedStatus?.[c.id] || false;

      return { 
        ...c, 
        avg: parseFloat(avg), 
        my: myScore,
        rawAvg: parseFloat(avg),
        official: officialScore,
        isRevealed // 発表済みフラグ
      };
    }).sort((a, b) => {
        // 1. 発表済みを優先
        if (a.isRevealed !== b.isRevealed) {
            return a.isRevealed ? -1 : 1;
        }
        // 2. プロ審査員得点でデフォルト降順 (発表済み同士の場合)
        return b.official - a.official;
    });

    const direction = sortDirection === 'asc' ? 1 : -1;
    
    return list.sort((a, b) => {
      // 発表済み優先は常に維持
      if (a.isRevealed !== b.isRevealed) {
         return a.isRevealed ? -1 : 1;
      }
      
      let comparison = 0;
      if (sortBy === 'my') {
        comparison = (a.my - b.my) * direction;
      } else if (sortBy === 'avg') {
        comparison = (a.rawAvg - b.rawAvg) * direction;
      } else if (sortBy === 'official') { // ★プロ審査員得点
        comparison = (a.official - b.official) * direction;
      } else { // 'id'
        comparison = (a.id - b.id) * direction;
      }
      return comparison;
    });

  }, [scores, safeComedians, user?.name, sortBy, sortDirection, displayData.officialScores, displayData.revealedStatus]);

  // ★採点一覧のソートヘッダーをトグル ('rank' -> 'official')
  const handleSort = (key: 'id' | 'my' | 'avg' | 'official') => {
    if (sortBy === key) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(key);
      setSortDirection(key === 'id' ? 'asc' : 'desc');
    }
  };


  const finalVoteResult = useMemo(() => {
    const result: Record<number, number> = {};
    safeFinalists.forEach(id => result[id] = 0);
    Object.values(finalVotes).forEach(voteId => {
      if (result[voteId] !== undefined) result[voteId]++;
    });
    return result;
  }, [finalVotes, safeFinalists]);

  const predictionStats = useMemo(() => {
    const total = Object.keys(predictions).length;
    const firstCounts: Record<number, number> = {};
    const top3Counts: Record<number, number> = {};

    Object.values(predictions).forEach((pred: any) => {
      const f = Number(pred.first);
      if (f) firstCounts[f] = (firstCounts[f] || 0) + 1;
      [pred.first, pred.second, pred.third].forEach(idStr => {
        const id = Number(idStr);
        if (id) top3Counts[id] = (top3Counts[id] || 0) + 1;
      });
    });

    const firstRanking = Object.entries(firstCounts)
      .map(([id, count]) => ({ id: Number(id), count }))
      .sort((a, b) => b.count - a.count);

    const top3Ranking = Object.entries(top3Counts)
      .map(([id, count]) => ({ id: Number(id), count }))
      .sort((a, b) => b.count - a.count);

    return { total, firstRanking, top3Ranking };
  }, [predictions]);

  const activePhase = viewMode || displayData.phase;

  const renderUserManagement = () => {
    const registeredUsers = Object.keys(allAuthUsers).map(name => ({
      name,
      isLoggedIn: !!activeSessionUsers[name],
      isAdmin: allAuthUsers[name]?.isAdmin || false,
      isAuth: true
    })).sort((a, b) => b.isLoggedIn - a.isLoggedIn || a.name.localeCompare(b.name));
    
    const loggedInUsers = Object.keys(activeSessionUsers)
      .filter(name => !allAuthUsers[name])
      .map(name => ({
        name,
        isLoggedIn: true,
        isAdmin: activeSessionUsers[name]?.isAdmin || false,
        isAuth: false
      }));

    return (
      <div className="animate-fade-in space-y-6">
        <h2 className="text-2xl font-black text-white mb-4">ユーザー管理</h2>

        {/* 登録ユーザーリスト (永続) */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 shadow-xl p-4">
          <h3 className="font-bold text-lg text-indigo-400 mb-3 flex items-center gap-2">
            登録ユーザー ({registeredUsers.length}人)
          </h3>
          <p className="text-xs text-slate-500 mb-4 whitespace-nowrap">ニックネームとパスワードが登録されています。</p>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {registeredUsers.map(u => (
              <div key={u.name} className="flex justify-between items-center bg-slate-800 p-3 rounded-lg border border-slate-700">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 text-xs font-bold rounded ${u.isLoggedIn ? 'bg-green-600' : 'bg-slate-600'}`}>
                    {u.isLoggedIn ? 'IN' : 'OFF'}
                  </span>
                  <span className={`font-bold whitespace-nowrap ${u.isAdmin ? 'text-yellow-500' : 'text-white'}`}>{u.name}</span>
                  {u.isAdmin && <span className="text-xs text-yellow-600 whitespace-nowrap">★Admin</span>}
                </div>
                <button 
                  onClick={() => adminDeleteUser(u.name)}
                  className="text-red-400 hover:text-red-300 p-1 rounded hover:bg-slate-700 transition"
                  title="認証情報とデータを完全削除"
                >
                  <UserMinus size={16}/>
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* ログイン中ユーザーリスト (セッションのみ) */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 shadow-xl p-4">
          <h3 className="font-bold text-lg text-red-400 mb-3 flex items-center gap-2">
            ログイン中ユーザー ({loggedInUsers.length + registeredUsers.filter(u => u.isLoggedIn).length}人)
          </h3>
          <p className="text-xs text-slate-500 mb-4 whitespace-nowrap">現在セッションが有効なユーザーです。</p>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {[...registeredUsers.filter(u => u.isLoggedIn), ...loggedInUsers].map(u => (
               <div key={u.name} className="flex justify-between items-center bg-slate-800 p-3 rounded-lg border border-slate-700">
                  <span className={`font-bold whitespace-nowrap ${u.isAdmin ? 'text-yellow-500' : 'text-white'}`}>
                    {u.name}
                  </span>
                  <button 
                    onClick={() => adminForceLogout(u.name)}
                    className="text-red-400 hover:text-red-300 p-1 rounded hover:bg-slate-700 transition whitespace-nowrap text-xs"
                  >
                    <UserX size={16} className="inline mr-1"/> 強制ログアウト
                  </button>
               </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderScoreDetail = (comedianId: number) => {
    const comedian = safeComedians.find(c => c.id === comedianId);
    const cScores = scores[comedianId] || {};
    const officialScore = displayData.officialScores[comedianId];

    if (!comedian || !displayData.revealedStatus?.[comedianId]) {
      return (
        <div className="text-center py-10 text-slate-400 bg-slate-900 rounded-xl">
          このコンビの採点結果はまだ公開されていません。
          <button 
            onClick={() => setDetailComedianId(null)}
            className="mt-4 text-sm text-blue-400 hover:text-blue-300 underline block mx-auto"
          >
            一覧に戻る
          </button>
        </div>
      );
    }
    
    const values = Object.values(cScores) as number[];
    const total = values.reduce((a, b) => a + b, 0);
    const avg = values.length > 0 ? (total / values.length).toFixed(1) : "0.0";

    return (
      <div className="animate-fade-in space-y-6">
        <div className="text-center mb-6">
          <h2 className="text-3xl font-black text-yellow-500 mb-2 whitespace-nowrap">{comedian.name}</h2>
          <p className="text-slate-400 text-sm whitespace-nowrap">採点詳細</p>
        </div>

        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-3">
            <div className="flex justify-around text-center border-b border-slate-700 pb-3">
                <div>
                    <div className="text-xs sm:text-sm text-slate-400 whitespace-nowrap">みんなの平均点</div>
                    <div className="text-4xl font-black text-yellow-400">{avg}</div>
                </div>
                <div>
                    <div className="text-xs sm:text-sm text-slate-400 whitespace-nowrap">プロ審査員得点</div>
                    <div className="text-4xl font-black text-red-500">{officialScore !== undefined && officialScore !== null ? officialScore : "-"}</div>
                </div>
            </div>
            
            <button 
              onClick={() => setDetailComedianId(null)}
              className="w-full text-center py-2 bg-slate-800 rounded text-green-400 hover:bg-slate-700 text-sm whitespace-nowrap"
            >
              一覧に戻る
            </button>
        </div>

        <div className="bg-slate-900 rounded-xl overflow-hidden border border-slate-800">
            <div className="bg-slate-800/50 px-4 py-3 border-b border-slate-800 flex items-center gap-2 text-sm font-bold text-slate-300 whitespace-nowrap">
                <Users size={16}/> 参加者別採点
            </div>
            <div className="p-4 grid grid-cols-3 sm:grid-cols-4 gap-3">
                {Object.entries(cScores).map(([name, score]) => (
                    <div key={name} className={`p-2 rounded text-center border ${name===user?.name ? 'bg-blue-900/50 border-blue-500' : 'bg-slate-800 border-slate-700'}`}>
                        <div className="text-[10px] text-slate-400 truncate mb-1">{name}</div>
                        <div className={`text-xl font-black ${score>=95 ? 'text-yellow-500' : score>=90 ? 'text-red-400' : 'text-white'}`}>{score}</div>
                    </div>
                ))}
            </div>
        </div>
      </div>
    );
  };


  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-slate-900 p-8 rounded-xl border border-slate-800 shadow-2xl">
          <div className="text-center mb-8">
            <Trophy className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
            <h1 className="text-3xl font-black text-white mb-2 tracking-tighter whitespace-nowrap">M-1 VOTING</h1>
            <p className="text-slate-400 whitespace-nowrap">Realtime Scoring App</p>
          </div>
          
          <div className="bg-slate-800/50 p-4 rounded-lg mb-6 text-xs text-slate-300 border border-slate-700 space-y-1 overflow-x-auto">
             <p className="whitespace-nowrap">※新規ユーザーはニックネームと任意のパスワードを設定してください。</p>
             <p className="text-red-400 whitespace-nowrap">※セキュリティが甘いので流出してもよいパスワードにしてください。</p>
             <p className="whitespace-nowrap">※ニックネームは後ほど編集できます。</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-slate-400 text-sm mb-1 whitespace-nowrap">ニックネーム</label>
              <input 
                type="text" 
                value={loginName}
                onChange={e => setLoginName(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded p-3 text-white focus:ring-2 focus:ring-yellow-500 outline-none"
                placeholder="例: 田中"
              />
            </div>
            
            <div className="pt-2">
              <label className="block text-slate-400 text-sm mb-1 whitespace-nowrap">パスワード</label>
              <input 
                type="password" 
                value={userPassword}
                onChange={e => setUserPassword(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded p-3 text-white focus:ring-2 focus:ring-yellow-500 outline-none"
                placeholder="パスワードを入力"
              />
            </div>

            <div className="pt-2">
              <label className="flex items-center gap-2 text-slate-400 text-sm cursor-pointer mb-2 whitespace-nowrap">
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
                    placeholder="管理者パスワードを入力" 
                  />
                </div>
              )}
            </div>

            <button type="submit" className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold py-3 rounded-lg transition-all transform active:scale-95 whitespace-nowrap">
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
        <div className="flex items-center gap-2 font-bold whitespace-nowrap">
          <span className="bg-yellow-500 text-black px-1.5 py-0.5 rounded text-xs">M-1</span>
          <span>VOTING</span>
        </div>
        
        {/* ユーザーメニュー */}
        <div className="relative">
          <button 
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="flex items-center gap-2 text-sm bg-slate-800 pl-3 pr-2 py-1.5 rounded-full border border-slate-700 hover:border-slate-500 transition-colors whitespace-nowrap"
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
                      onClick={() => { setViewMode(null); setIsMenuOpen(false); setDetailComedianId(null); }}
                      className="w-full text-left px-3 py-2 text-sm text-green-400 hover:bg-slate-700 rounded flex items-center gap-2 mb-2 bg-green-900/20 whitespace-nowrap"
                    >
                      <LayoutDashboard size={16}/> 現在の進行に戻る
                    </button>
                  )}

                  <div className="px-3 py-1 text-[10px] text-slate-500 font-bold whitespace-nowrap">開始前</div>
                  <button 
                    onClick={() => { setViewMode('PREDICTION'); setIsMenuOpen(false); setDetailComedianId(null); }}
                    className={`w-full text-left px-3 py-2 text-sm rounded flex items-center gap-2 whitespace-nowrap ${viewMode === 'PREDICTION' ? 'bg-blue-900/50 text-blue-300' : 'hover:bg-slate-700 text-slate-200'}`}
                  >
                    <Crown size={16} className="text-yellow-500"/> 3連単予想を編集
                  </button>
                  <button 
                    onClick={() => { setViewMode('PREDICTION_REVEAL'); setIsMenuOpen(false); setDetailComedianId(null); }}
                    className={`w-full text-left px-3 py-2 text-sm rounded flex items-center gap-2 whitespace-nowrap ${viewMode === 'PREDICTION_REVEAL' ? 'bg-purple-900/50 text-purple-300' : 'hover:bg-slate-700 text-slate-200'}`}
                  >
                    <List size={16} className="text-purple-400"/> みんなの予想
                  </button>

                  <div className="px-3 py-1 text-[10px] text-slate-500 font-bold mt-2 whitespace-nowrap">1stラウンド</div>
                  <button 
                    onClick={() => { setViewMode('SCORE_HISTORY'); setIsMenuOpen(false); setDetailComedianId(null); }}
                    className={`w-full text-left px-3 py-2 text-sm rounded flex items-center gap-2 whitespace-nowrap ${viewMode === 'SCORE_HISTORY' && detailComedianId === null ? 'bg-orange-900/50 text-orange-300' : 'hover:bg-slate-700 text-slate-200'}`}
                  >
                    <ClipboardList size={16} className="text-orange-500"/> 採点結果一覧
                  </button>
                  <button 
                    onClick={() => { setViewMode('SCORE_DETAIL'); setIsMenuOpen(false); setDetailComedianId(null); }}
                    className={`w-full text-left px-3 py-2 text-sm rounded flex items-center gap-2 whitespace-nowrap ${viewMode === 'SCORE_DETAIL' ? 'bg-orange-900/50 text-orange-300' : 'hover:bg-slate-700 text-slate-200'}`}
                  >
                    <BarChart3 size={16} className="text-orange-500"/> コンビ毎採点詳細
                  </button>

                  <div className="px-3 py-1 text-[10px] text-slate-500 font-bold mt-2 whitespace-nowrap">最終決戦</div>
                  <button 
                    onClick={() => { setViewMode('FINAL_VOTE'); setIsMenuOpen(false); setDetailComedianId(null); }}
                    className={`w-full text-left px-3 py-2 text-sm rounded flex items-center gap-2 whitespace-nowrap ${viewMode === 'FINAL_VOTE' ? 'bg-red-900/50 text-red-300' : 'hover:bg-slate-700 text-slate-200'}`}
                  >
                    <Vote size={16} className="text-red-500"/> 投票一覧
                  </button>
                  
                  {user.isAdmin && (
                    <>
                      <div className="px-3 py-1 text-[10px] text-slate-500 font-bold mt-2 whitespace-nowrap">管理者設定</div>
                      <button 
                        onClick={() => { setViewMode('USER_MANAGEMENT'); setIsMenuOpen(false); setDetailComedianId(null); }}
                        className={`w-full text-left px-3 py-2 text-sm rounded flex items-center gap-2 whitespace-nowrap ${viewMode === 'USER_MANAGEMENT' ? 'bg-indigo-900/50 text-indigo-300' : 'hover:bg-slate-700 text-slate-200'}`}
                      >
                        <Users size={16} className="text-indigo-400"/> ユーザー管理
                      </button>
                    </>
                  )}
                  
                  <button 
                      onClick={() => { setShowNicknameModal(true); setIsMenuOpen(false); }}
                      className="w-full text-left px-3 py-2 text-sm text-blue-400 hover:bg-slate-700 rounded flex items-center gap-2 whitespace-nowrap"
                  >
                      <UserCog size={16}/> ニックネーム変更
                  </button>

                  <div className="border-t border-slate-700/50 my-2"></div>

                  <button 
                    onClick={handleLogout}
                    className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-slate-700 rounded flex items-center gap-2 whitespace-nowrap"
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
      <div className={`text-center py-2 text-sm font-bold text-white shadow-lg transition-colors duration-300 whitespace-nowrap
        ${viewMode ? 'bg-slate-700' : displayData.phase === 'PREDICTION' ? 'bg-blue-600' : displayData.phase === 'PREDICTION_REVEAL' ? 'bg-purple-600' : displayData.phase === 'SCORING' ? 'bg-red-700' : displayData.phase === 'FINAL_VOTE' ? 'bg-yellow-600' : 'bg-green-600'}`}>
        
        {viewMode === 'USER_MANAGEMENT' && "👤 ユーザー管理"}
        {viewMode === 'SCORE_HISTORY' && "📊 採点結果一覧"}
        {viewMode === 'SCORE_DETAIL' && (detailComedianId ? `📊 ${getComedianName(detailComedianId)} 採点詳細` : "📊 コンビ別採点詳細")}
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

        {/* --- USER MANAGEMENT PHASE --- */}
        {activePhase === 'USER_MANAGEMENT' && renderUserManagement()}

        {/* --- SCORE DETAIL INDEX / VIEWER --- */}
        {activePhase === 'SCORE_DETAIL' && (
          <>
            {detailComedianId ? (
              renderScoreDetail(detailComedianId)
            ) : (
              <div className="animate-fade-in space-y-6">
                <h3 className="text-xl font-bold text-white mb-4 whitespace-nowrap">結果公開済みのコンビ</h3>
                <div className="grid gap-3">
                  {/* ★修正: 採点済み（結果オープン済み）のコンビを優先的に表示。さらにプロ審査員得点があればそれでソート */}
                  {safeComedians
                    .slice() // コピー
                    .sort((a, b) => {
                      const revealedA = displayData.revealedStatus?.[a.id] ? 1 : 0;
                      const revealedB = displayData.revealedStatus?.[b.id] ? 1 : 0;
                      if (revealedA !== revealedB) return revealedB - revealedA; // オープン済みが先

                      const scoreA = displayData.officialScores[a.id] || 0;
                      const scoreB = displayData.officialScores[b.id] || 0;
                      return scoreB - scoreA; // プロ審査員得点の降順
                    })
                    .map(c => {
                    const isRevealed = displayData.revealedStatus?.[c.id]; 
                    
                    return (
                      <button 
                        key={c.id}
                        onClick={() => {
                          if (isRevealed) setDetailComedianId(c.id);
                        }}
                        disabled={!isRevealed}
                        className={`w-full text-left p-4 rounded-xl border transition-all flex justify-between items-center
                          ${isRevealed 
                            ? 'bg-slate-800 border-green-700 hover:bg-slate-700' 
                            : 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'}`}
                      >
                        <span className={`font-bold text-lg whitespace-nowrap ${isRevealed ? 'text-white' : 'text-slate-600'}`}>{c.name}</span>
                        {isRevealed ? <CheckCircle2 className="text-green-500" size={20}/> : <EyeOff size={20}/>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* --- SCORE HISTORY PHASE --- */}
        {activePhase === 'SCORE_HISTORY' && (
          <div className="animate-fade-in space-y-6">
            <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-xl">
              <div className="p-4 bg-slate-800/50 border-b border-slate-800 flex items-center gap-2">
                <BarChart3 className="text-orange-500" size={20}/>
                <h2 className="font-bold text-lg whitespace-nowrap">採点結果一覧</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-800 text-slate-400">
                    <tr>
                      <th className="p-3 text-center w-10 text-xs sm:text-sm whitespace-nowrap">#</th>
                      <th 
                        className="p-3 cursor-pointer hover:text-white transition-colors text-xs sm:text-sm whitespace-nowrap"
                        onClick={() => handleSort('id')}
                      >
                        コンビ名
                      </th>
                      <th 
                        className="p-3 text-center cursor-pointer hover:text-white transition-colors text-xs sm:text-sm whitespace-nowrap"
                        onClick={() => handleSort('my')}
                      >
                        わたし
                      </th>
                      <th 
                        className="p-3 text-center cursor-pointer hover:text-white transition-colors text-xs sm:text-sm whitespace-nowrap"
                        onClick={() => handleSort('avg')}
                      >
                        みんな
                      </th>
                      <th 
                        className="p-3 text-center cursor-pointer hover:text-white transition-colors text-xs sm:text-sm whitespace-nowrap"
                        onClick={() => handleSort('official')} // ★修正: キーを'rank'から'official'へ
                      >
                        プロ審査員
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {ranking.map((c, i) => { 
                      const isRevealed = displayData.revealedStatus?.[c.id];
                      const myScoreVal = scores[c.id]?.[user?.name || ''];
                      const officialScore = displayData.officialScores[c.id];

                      return (
                        <tr key={c.id} className="hover:bg-slate-800/50">
                          <td className="p-3 text-center text-slate-500 text-xs sm:text-sm whitespace-nowrap">{i + 1}</td>
                          <td className="p-3 font-bold text-white text-xs sm:text-sm whitespace-nowrap">{c.name}</td>
                          <td className="p-3 text-center font-bold text-blue-400 text-xs sm:text-sm whitespace-nowrap">
                            {myScoreVal !== undefined ? myScoreVal : "-"}
                          </td>
                          <td className="p-3 text-center font-bold text-yellow-500 text-xs sm:text-sm whitespace-nowrap">
                            {isRevealed && c.rawAvg > 0 ? c.rawAvg : <span className="text-slate-600">???</span>}
                          </td>
                          <td className="p-3 text-center text-xs sm:text-sm whitespace-nowrap">
                            {officialScore !== undefined && officialScore !== null ? (
                              <span className={`inline-block px-2 py-1 rounded text-xs font-bold leading-none bg-red-600 text-white`}>
                                {officialScore}
                              </span>
                            ) : (
                              <span className="text-slate-500">-</span>
                            )}
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
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-yellow-500 whitespace-nowrap">
                <Crown size={24}/> 3連単予想
              </h2>
              <div className="space-y-4">
                {['優勝', '2位', '3位'].map((rank, i) => (
                  <div key={rank} className="flex items-center gap-3">
                    <span className={`w-12 font-bold whitespace-nowrap ${i===0?'text-yellow-400':i===1?'text-slate-300':'text-amber-700'}`}>{rank}</span>
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
                className="mt-6 w-full py-3 bg-yellow-500 hover:bg-yellow-400 disabled:bg-slate-700 text-black font-bold rounded-lg flex items-center justify-center gap-2 transition-all whitespace-nowrap"
              >
                {isSubmitting ? <Loader2 className="animate-spin"/> : isPredictionSubmitted ? <CheckCircle2 size={20}/> : <Save size={20}/>}
                {isSubmitting ? "保存中..." : isPredictionSubmitted ? "保存済み" : "予想を保存する"}
              </button>
            </div>

            <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
              <h3 className="text-sm font-bold text-slate-400 mb-4 flex items-center gap-2 whitespace-nowrap">
                <Users size={16}/> 提出済みのメンバー
              </h3>
              <div className="flex flex-wrap gap-2">
                {Object.keys(predictions).length === 0 && <span className="text-slate-600 text-sm whitespace-nowrap">まだ誰も提出していません</span>}
                {Object.keys(predictions).map(name => (
                  <span key={name} className="px-3 py-1 bg-slate-800 text-slate-200 rounded-full text-sm border border-slate-700 flex items-center gap-1 whitespace-nowrap">
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
              <h2 className="text-2xl font-black text-white mb-2 tracking-tighter text-yellow-500 whitespace-nowrap">みんなの予想</h2>
              <p className="text-slate-400 text-sm whitespace-nowrap">誰が優勝を当てられるか？</p>
            </div>

            {/* ★集計結果表示 */}
            <div className="grid gap-4 sm:grid-cols-2 mb-8">
               {/* 左：1位予想ランキング */}
               <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 shadow-lg">
                  <div className="flex items-center gap-2 border-b border-slate-700 pb-2 mb-3">
                     <Crown size={20} className="text-yellow-500"/>
                     <span className="font-bold text-white whitespace-nowrap">優勝予想ランキング</span>
                  </div>
                  <div className="space-y-2">
                     {predictionStats.firstRanking.length === 0 && <p className="text-slate-500 text-xs whitespace-nowrap">データなし</p>}
                     {predictionStats.firstRanking.map((item, idx) => (
                        <div key={item.id} className="flex justify-between items-center text-sm">
                           <div className="flex items-center gap-2">
                              <span className={`font-bold w-4 ${idx===0?'text-yellow-500':idx===1?'text-slate-300':'text-amber-700'}`}>{idx+1}.</span>
                              <span className="text-slate-200 whitespace-nowrap">{getComedianName(item.id)}</span>
                           </div>
                           <span className="font-bold text-white whitespace-nowrap">{item.count}票</span>
                        </div>
                     ))}
                  </div>
               </div>

               {/* 右：Top3選出数ランキング */}
               <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 shadow-lg">
                  <div className="flex items-center gap-2 border-b border-slate-700 pb-2 mb-3">
                     <TrendingUp size={20} className="text-green-500"/>
                     <span className="font-bold text-white whitespace-nowrap">3連単入りランキング</span>
                  </div>
                  <div className="space-y-2">
                     {predictionStats.top3Ranking.length === 0 && <p className="text-slate-500 text-xs whitespace-nowrap">データなし</p>}
                     {predictionStats.top3Ranking.slice(0, 5).map((item, idx) => (
                        <div key={item.id} className="flex justify-between items-center text-sm">
                           <div className="flex items-center gap-2">
                              <span className="font-bold w-4 text-slate-500">{idx+1}.</span>
                              <span className="text-slate-200 whitespace-nowrap">{getComedianName(item.id)}</span>
                           </div>
                           <span className="font-bold text-white whitespace-nowrap">{item.count}票</span>
                        </div>
                     ))}
                  </div>
               </div>
            </div>
            
            {/* 投票人数バッジ */}
            <div className="text-center mb-4">
               <span className="bg-slate-800 text-slate-400 px-4 py-1 rounded-full text-xs border border-slate-700 whitespace-nowrap">
                  投票人数：<span className="text-white font-bold text-sm ml-1">{predictionStats.total}</span> 人
               </span>
            </div>

            {/* 個別予想リスト */}
            <div className="grid gap-4 sm:grid-cols-2">
              {Object.entries(predictions).map(([name, pred]: [string, any]) => (
                <div key={name} className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-2 opacity-10"><Crown size={60}/></div>
                  <div className="font-bold text-lg text-white mb-3 border-b border-slate-800 pb-2 flex items-center gap-2">
                    <span className="w-2 h-6 bg-blue-600 rounded-full"></span>
                    <span className="whitespace-nowrap">{name}</span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-8 text-yellow-500 font-bold whitespace-nowrap">1位</span>
                      <span className="font-bold text-white text-lg whitespace-nowrap">{getComedianName(pred.first)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-8 text-slate-400 font-bold whitespace-nowrap">2位</span>
                      <span className="text-slate-200 whitespace-nowrap">{getComedianName(pred.second)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-8 text-amber-700 font-bold whitespace-nowrap">3位</span>
                      <span className="text-slate-200 whitespace-nowrap">{getComedianName(pred.third)}</span>
                    </div>
                  </div>
                </div>
              ))}
              {Object.keys(predictions).length === 0 && (
                <div className="col-span-2 text-center py-10 text-slate-500 bg-slate-900 rounded-xl whitespace-nowrap">
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
                <div className="text-red-300 font-bold text-xs tracking-widest mb-2 whitespace-nowrap">ENTRY NO.{displayData.currentComedianIndex + 1}</div>
                <h2 className="text-3xl sm:text-5xl font-black text-white mb-4 drop-shadow-lg tracking-tight whitespace-nowrap">
                  {currentComedian?.name}
                </h2>
                {displayData.isScoreRevealed ? (
                  <div className="inline-flex items-baseline gap-2 bg-black/40 px-6 py-2 rounded-full backdrop-blur-sm border border-yellow-500/30">
                    <span className="text-sm text-slate-300 whitespace-nowrap">平均</span>
                    <span className="text-5xl font-black text-yellow-400">{ranking.find(c => c.id === currentComedian.id)?.avg}</span>
                    <span className="text-lg font-bold text-yellow-600 whitespace-nowrap">点</span>
                  </div>
                ) : (
                  <div className="h-16 flex items-center justify-center text-slate-400 text-sm animate-pulse whitespace-nowrap">
                    {displayData.phase === 'SCORING' ? "審査中..." : ""}
                  </div>
                )}
              </div>
            </div>

            {/* プロ審査員得点の表示 (平均点の下に配置) */}
            {displayData.officialScores[currentComedian.id] !== undefined && displayData.officialScores[currentComedian.id] !== null && (
                <div className="text-center text-xl font-bold text-red-400 whitespace-nowrap">
                    プロ審査員得点: {displayData.officialScores[currentComedian.id]} 点
                </div>
            )}


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
                      className="w-full py-4 bg-yellow-500 hover:bg-yellow-400 text-black font-black text-xl rounded-lg shadow-lg shadow-yellow-500/20 transform transition active:scale-95 disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2 whitespace-nowrap"
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
                    <h3 className="text-xl font-bold text-white mb-2 whitespace-nowrap">採点完了</h3>
                    <p className="text-slate-400 text-sm whitespace-nowrap">結果発表をお待ちください</p>
                    <button onClick={() => setIsScoreSubmitted(false)} className="mt-4 text-sm text-slate-500 hover:text-white underline whitespace-nowrap">
                      修正する
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ★修正: 採点中画面に提出済みメンバーを表示 */}
            {!displayData.isScoreRevealed && displayData.phase === 'SCORING' && (
               <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
                  <h3 className="text-sm font-bold text-slate-400 mb-4 flex items-center gap-2 whitespace-nowrap">
                     <Users size={16}/> 採点提出済みのメンバー
                  </h3>
                  <div className="flex flex-wrap gap-2">
                     {Object.keys(scores[currentComedian.id] || {}).length === 0 && <span className="text-slate-600 text-sm whitespace-nowrap">まだ誰も提出していません</span>}
                     {Object.keys(scores[currentComedian.id] || {}).map(name => (
                        <span key={name} className="px-3 py-1 bg-slate-800 text-slate-200 rounded-full text-sm border border-slate-700 flex items-center gap-1 whitespace-nowrap">
                           <CheckCircle2 size={12} className="text-green-500"/> {name}
                        </span>
                     ))}
                  </div>
               </div>
            )}

            {displayData.isScoreRevealed && (
              <div className="space-y-4">
                <div className="bg-slate-900 rounded-xl overflow-hidden border border-slate-800">
                  <div className="bg-slate-800/50 px-4 py-3 border-b border-slate-800 flex items-center gap-2 text-sm font-bold text-slate-300 whitespace-nowrap">
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
                  <div className="bg-slate-800/50 px-4 py-3 border-b border-slate-800 flex items-center gap-2 text-sm font-bold text-slate-300 whitespace-nowrap">
                    <Trophy size={16}/> 現在の順位
                  </div>
                  <div className="divide-y divide-slate-800">
                    {ranking.filter(c => c.rawAvg > 0).map((c, i) => (
                      <div key={c.id} className={`flex items-center justify-between p-3 ${c.id===currentComedian.id ? 'bg-yellow-500/5' : ''}`}>
                        <div className="flex items-center gap-3">
                          <span className={`w-6 h-6 flex items-center justify-center rounded text-xs font-bold 
                            ${i===0 ? 'bg-yellow-500 text-black' : i===1 ? 'bg-slate-400 text-black' : i===2 ? 'bg-amber-700 text-white' : 'bg-slate-800 text-slate-500'}`}>
                            {i+1}
                          </span>
                          <span className="font-bold text-sm whitespace-nowrap">{c.name}</span>
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
              <h2 className="text-2xl font-black text-white tracking-tighter mb-6 whitespace-nowrap">優勝するのは誰だ</h2>
            </div>

            {/* 決戦3組の表示 & 投票 */}
            <div className="grid gap-4">
              {(!safeFinalists || safeFinalists.length === 0) && (
                <div className="text-center text-slate-500 py-10 bg-slate-900 rounded-xl border border-slate-800 whitespace-nowrap">
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
                      <span className={`text-2xl font-black ${isSelected ? 'text-white' : 'text-slate-300'} whitespace-nowrap`}>{comedian.name}</span>
                      {isSelected && !displayData.isScoreRevealed && <CheckCircle2 className="text-red-500" size={32}/>}
                      
                      {displayData.isScoreRevealed && (
                        <div className="flex items-end gap-2">
                          <span className="text-4xl font-black text-yellow-500">{voteCount}</span>
                          <span className="text-xs text-slate-400 mb-1 whitespace-nowrap">票</span>
                        </div>
                      )}
                    </div>

                    {displayData.isScoreRevealed && (
                      <div className="mt-4 pt-4 border-t border-slate-700/50 flex flex-wrap gap-2">
                        {Object.entries(finalVotes).filter(([_, vId]) => vId === id).map(([name]) => (
                          <span key={name} className="text-xs bg-slate-800 px-2 py-1 rounded text-slate-300 border border-slate-700 whitespace-nowrap">
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
                className={`w-full py-4 mt-4 font-black text-xl rounded-lg shadow-lg flex items-center justify-center gap-2 transition-all whitespace-nowrap
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
              <div className="text-center text-slate-400 py-4 bg-slate-800 rounded-xl border border-yellow-800 whitespace-nowrap">
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
                {/* ★フェーズボタンは updateGameStateAndSync を使うように変更 */}
                <button onClick={() => updateGameState({phase: 'PREDICTION'})} className={`px-2 py-1 rounded text-xs whitespace-nowrap ${gameState.phase==='PREDICTION' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}>予想</button>
                <button onClick={() => updateGameState({phase: 'PREDICTION_REVEAL'})} className={`px-2 py-1 rounded text-xs whitespace-nowrap ${gameState.phase==='PREDICTION_REVEAL' ? 'bg-purple-600 text-white' : 'text-slate-400'}`}>発表</button>
                <button onClick={() => updateGameState({phase: 'SCORING'})} className={`px-2 py-1 rounded text-xs whitespace-nowrap ${gameState.phase==='SCORING' ? 'bg-red-600 text-white' : 'text-slate-400'}`}>採点</button>
                <button onClick={() => updateGameState({phase: 'FINAL_VOTE', isScoreRevealed: false})} className={`px-2 py-1 rounded text-xs whitespace-nowrap ${gameState.phase==='FINAL_VOTE' ? 'bg-yellow-600 text-white' : 'text-slate-400'}`}>投票</button>
              </div>
            </div>

            {/* フェーズごとの操作パネル切り替え */}
            {gameState.phase === 'SCORING' ? (
              <div className="space-y-3">
                
                {/* ★敗者復活組の名前変更フォーム (SCORINGフェーズかつIDが10の場合) */}
                {gameState.comedians[gameState.currentComedianIndex]?.id === 10 && (
                   <div className="flex items-center gap-2 bg-slate-800 p-2 rounded-lg border border-blue-900/50">
                     <input 
                       type="text" 
                       className="flex-1 bg-transparent text-white text-sm px-2 py-1 rounded focus:outline-none"
                       placeholder="敗者復活組の名前を入力"
                       value={editingName}
                       onChange={e => setEditingName(e.target.value)}
                     />
                     <button 
                       onClick={() => {
                         const newComedians = [...(gameState.comedians || INITIAL_COMEDIANS)];
                         newComedians[gameState.currentComedianIndex].name = editingName;
                         updateGameState({comedians: newComedians});
                         setEditingName("");
                       }}
                       className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1.5 rounded font-bold whitespace-nowrap"
                     >
                       名前更新
                     </button>
                   </div>
                )}

                {/* プロ審査員得点入力 */}
                <div className="flex items-center gap-2 bg-slate-800 p-2 rounded-lg border border-slate-700">
                  <input
                    type="number"
                    min="600"
                    max="700"
                    placeholder="プロ審査員得点 (例: 650)"
                    value={adminOfficialScore}
                    onChange={e => setAdminOfficialScore(e.target.value)}
                    className="flex-1 bg-transparent text-white text-sm px-2 py-1 rounded focus:outline-none"
                  />
                  <button
                    onClick={adminSaveOfficialScore}
                    className="bg-red-600 hover:bg-red-500 text-white text-xs px-3 py-1.5 rounded font-bold whitespace-nowrap"
                  >
                    得点確定
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button onClick={() => adminChangeComedian(Math.max(0, gameState.currentComedianIndex - 1))} className="p-3 bg-slate-800 rounded-lg hover:bg-slate-700 text-white"><ChevronLeft/></button>
                  <button onClick={adminToggleReveal} className={`flex-1 py-3 font-bold rounded-lg flex items-center justify-center gap-2 transition-colors whitespace-nowrap ${gameState.isScoreRevealed ? 'bg-slate-800 text-slate-300' : 'bg-red-600 hover:bg-red-500 text-white'}`}>
                    {gameState.isScoreRevealed ? <><EyeOff size={18}/> CLOSE</> : <><Eye size={18}/> 結果オープン</>}
                  </button>
                  <button onClick={() => {
                    if (gameState.currentComedianIndex < 9) adminChangeComedian(gameState.currentComedianIndex + 1);
                    else updateGameState({phase: 'FINISHED'}); // ★変更: 終了時も同期命令
                  }} className="p-3 bg-slate-800 rounded-lg hover:bg-slate-700 text-white"><ChevronRight/></button>
                </div>
              </div>
            ) : gameState.phase === 'FINAL_VOTE' ? (
              <div className="space-y-2">
                <button 
                  onClick={() => {
                    // モーダルを開く前に、現在の決戦進出者を一時変数にコピー
                    setTempFinalists(gameState.finalists);
                    setShowFinalistModal(true);
                  }}
                  className="w-full py-2 bg-slate-800 border border-slate-700 hover:border-yellow-500 text-yellow-500 rounded text-sm font-bold whitespace-nowrap"
                >
                  決戦に進んだ3組を選ぶ
                </button>
                <button 
                  onClick={adminToggleReveal} // ★変更: 投票結果オープンもadminToggleRevealに統一
                  className={`w-full py-3 font-bold rounded-lg flex items-center justify-center gap-2 transition-colors whitespace-nowrap ${gameState.isScoreRevealed ? 'bg-slate-800 text-slate-300' : 'bg-red-600 hover:bg-red-500 text-white'}`}
                >
                  {gameState.isScoreRevealed ? <><EyeOff size={18}/> 投票結果を隠す</> : <><Eye size={18}/> 投票結果オープン</>}
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                {/* PREDICTION, PREDICTION_REVEAL フェーズ等 */}
              </div>
            )}

            <button onClick={() => setShowResetModal(true)} className="w-full mt-2 text-xs text-slate-600 hover:text-red-500 py-1 whitespace-nowrap">データリセット</button>
          </div>
        </div>
      )}

      {/* 決戦3組選択モーダル */}
      {showFinalistModal && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 w-full max-w-sm rounded-xl border border-slate-700 p-6 space-y-4">
            <h3 className="text-xl font-bold text-white text-center whitespace-nowrap">決戦の3組を選択</h3>
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
                    <span className="whitespace-nowrap">{c.name}</span>
                    {isSelected && <CheckCircle2 size={16}/>}
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowFinalistModal(false)} className="flex-1 py-2 bg-slate-800 rounded text-slate-400 whitespace-nowrap">キャンセル</button>
              <button onClick={adminSaveFinalists} className="flex-1 py-2 bg-yellow-600 hover:bg-yellow-500 text-white font-bold rounded whitespace-nowrap">決定</button>
            </div>
          </div>
        </div>
      )}

      {/* データリセットモーダル */}
      {showResetModal && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 w-full max-w-sm rounded-xl border border-slate-700 p-6 space-y-4">
            <h3 className="text-xl font-bold text-white text-center text-red-400 whitespace-nowrap">🚨 データリセット</h3>
            <p className="text-sm text-slate-400">リセットの範囲を選択してください。実行後、全参加者の画面が同期されます。</p>
            <div className="space-y-3">
                <button
                    onClick={() => executeDatabaseReset('predictions_only')} // ★変更
                    className="w-full py-3 bg-blue-600/30 border border-blue-700 text-blue-300 rounded-lg font-bold hover:bg-blue-600/50 transition-colors"
                >
                    <span className="whitespace-nowrap">予想データのみリセット</span>
                    <p className='font-normal text-xs mt-1 text-slate-400'>(採点結果、ユーザー情報は保持)</p>
                </button>
                <button
                    onClick={() => executeDatabaseReset('scores_only')} // ★変更
                    className="w-full py-3 bg-orange-600/30 border border-orange-700 text-orange-300 rounded-lg font-bold hover:bg-orange-600/50 transition-colors"
                >
                    <span className="whitespace-nowrap">採点データのみリセット</span>
                    <p className='font-normal text-xs mt-1 text-slate-400'>(予想、ユーザー情報は保持)</p>
                </button>
                 <button
                    onClick={() => executeDatabaseReset('all')}
                    className="w-full py-3 bg-red-600/30 border border-red-700 text-red-300 rounded-lg font-bold hover:bg-red-600/50 transition-colors"
                >
                    <span className="whitespace-nowrap">全データ（ユーザー認証情報含む）リセット</span>
                    <p className='font-normal text-xs mt-1 text-slate-400'>(新規ユーザー登録から必要)</p>
                </button>
            </div>
            <button onClick={() => setShowResetModal(false)} className="w-full py-2 bg-slate-700 rounded text-slate-400 mt-4 whitespace-nowrap">キャンセル</button>
          </div>
        </div>
      )}

      {/* ★ニックネーム変更モーダル */}
      {showNicknameModal && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 w-full max-w-sm rounded-xl border border-slate-700 p-6 space-y-4">
            <h3 className="text-xl font-bold text-white text-center whitespace-nowrap">ニックネーム変更</h3>
            <p className="text-sm text-slate-400 text-center">新しいニックネームを入力してください。<br/>過去のデータは引き継がれます。</p>
            
            <input 
              type="text" 
              value={newNickname}
              onChange={e => setNewNickname(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded p-3 text-white focus:ring-2 focus:ring-yellow-500 outline-none"
              placeholder="新しいニックネーム"
            />
            
            <div className="flex gap-2 mt-4">
              <button onClick={() => { setShowNicknameModal(false); setNewNickname(""); }} className="flex-1 py-2 bg-slate-800 rounded text-slate-400 whitespace-nowrap">キャンセル</button>
              <button onClick={handleNicknameChange} className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded whitespace-nowrap">変更する</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
