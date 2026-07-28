import React, { useState, useEffect } from "react";
import {
  db,
  collection,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  getDoc,
} from "../../lib/firebase";

type PayoutRequest = {
  id: string;
  userId: string;
  username: string;
  name?: string;
  email?: string;
  mobileNumber?: string;
  upiId: string;
  goldAmount: number;
  inrValue: string;
  status: string;
  createdAt: string;
};

type UserProfile = {
  id: string;
  username?: string;
  name?: string;
  email?: string;
  mobileNumber?: string;
  upiId?: string;
  level?: number;
  xp?: number;
  hp?: number;
  maxHp?: number;
  gold?: number;
  isDead?: boolean;
  focusMode?: boolean;
  updatedAt?: string;
};

interface AdminPortalModuleProps {
  onClose?: () => void;
}

export const AdminPortalModule: React.FC<AdminPortalModuleProps> = ({ onClose }) => {
  const [adminTab, setAdminTab] = useState<"payouts" | "users">("payouts");
  const [payoutRequests, setPayoutRequests] = useState<PayoutRequest[]>([]);
  const [userProfiles, setUserProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Fetch Firestore Data for Admin Oversight
  const fetchAdminData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Payout Requests
      const payoutsCol = collection(db, "payout_requests");
      const payoutsSnapshot = await getDocs(payoutsCol);
      const payoutsList: PayoutRequest[] = [];
      payoutsSnapshot.forEach((docSnap) => {
        payoutsList.push({ id: docSnap.id, ...(docSnap.data() as any) });
      });
      payoutsList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setPayoutRequests(payoutsList);

      // 2. Fetch All Student User Profiles (Filter out Admin & De-duplicate)
      const profilesCol = collection(db, "profiles");
      const profilesSnapshot = await getDocs(profilesCol);
      const rawList: UserProfile[] = [];

      profilesSnapshot.forEach((docSnap) => {
        const data = docSnap.data() as any;
        const email = (data.email || "").toLowerCase();
        const username = (data.username || data.name || "").toLowerCase();
        const role = (data.role || "").toUpperCase();
        const isAdmin = data.isAdmin === true;

        // Filter out Admin Account
        const isAdminAccount =
          docSnap.id === "admin_tharun" ||
          email === "vallapureddytharunreddy6281@gmail.com" ||
          username === "tharun" ||
          role === "ADMIN" ||
          isAdmin;

        if (!isAdminAccount) {
          rawList.push({ id: docSnap.id, ...data });
        }
      });

      // De-duplicate by Email or Username (keeping highest XP or newest update)
      const uniqueProfilesMap = new Map<string, UserProfile>();
      rawList.forEach((profile) => {
        const key = (profile.email || profile.username || profile.id).toLowerCase();
        if (!uniqueProfilesMap.has(key)) {
          uniqueProfilesMap.set(key, profile);
        } else {
          const existing = uniqueProfilesMap.get(key)!;
          const isNewer =
            new Date(profile.updatedAt || 0).getTime() >
            new Date(existing.updatedAt || 0).getTime();
          if (isNewer || (profile.xp || 0) > (existing.xp || 0)) {
            uniqueProfilesMap.set(key, profile);
          }
        }
      });

      setUserProfiles(Array.from(uniqueProfilesMap.values()));
    } catch (err) {
      console.warn("[AdminPortal] Error fetching data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  // Admin Action: Approve Payout & Transfer INR via UPI
  const handleApprovePayout = async (payout: PayoutRequest) => {
    try {
      const payoutRef = doc(db, "payout_requests", payout.id);
      await updateDoc(payoutRef, {
        status: "APPROVED & TRANSFERRED VIA UPI BY ADMIN",
        approvedAt: new Date().toISOString(),
      });

      setPayoutRequests((prev) =>
        prev.map((p) =>
          p.id === payout.id ? { ...p, status: "APPROVED & TRANSFERRED VIA UPI BY ADMIN" } : p
        )
      );
      triggerToast(`✅ Payout of ${payout.inrValue} approved for ${payout.upiId}!`);
    } catch (err) {
      console.warn("[AdminPortal] Error approving payout:", err);
      triggerToast("⚠️ Failed to update payout status.");
    }
  };

  // Admin Action: Reject Payout & Refund Gold to User
  const handleRejectPayout = async (payout: PayoutRequest) => {
    try {
      // 1. Update Payout Status
      const payoutRef = doc(db, "payout_requests", payout.id);
      await updateDoc(payoutRef, {
        status: "REJECTED BY ADMIN (Gold Refunded)",
        rejectedAt: new Date().toISOString(),
      });

      // 2. Refund Gold to User Profile in Firestore
      if (payout.userId) {
        const userRef = doc(db, "profiles", payout.userId);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const currentGold = userSnap.data()?.gold || 0;
          await updateDoc(userRef, {
            gold: currentGold + payout.goldAmount,
          });
        }
      }

      setPayoutRequests((prev) =>
        prev.map((p) =>
          p.id === payout.id ? { ...p, status: "REJECTED BY ADMIN (Gold Refunded)" } : p
        )
      );
      triggerToast(`❌ Payout rejected. ${payout.goldAmount} Gold refunded to user.`);
    } catch (err) {
      console.warn("[AdminPortal] Error rejecting payout:", err);
      triggerToast("⚠️ Failed to reject payout.");
    }
  };

  // Admin Action: Delete User Profile Document from Firestore
  const handleDeleteUserProfile = async (profileId: string, username?: string) => {
    try {
      const userRef = doc(db, "profiles", profileId);
      await deleteDoc(userRef);
      setUserProfiles((prev) => prev.filter((u) => u.id !== profileId));
      triggerToast(`🗑️ Profile ${username || profileId} deleted from Firestore!`);
    } catch (err) {
      console.warn("[AdminPortal] Error deleting user profile:", err);
      triggerToast("⚠️ Failed to delete profile document.");
    }
  };

  // Calculate Metrics
  const pendingRequests = payoutRequests.filter(
    (p) => p.status === "PENDING_ADMIN_APPROVAL"
  );
  const totalPendingGold = pendingRequests.reduce((sum, p) => sum + (p.goldAmount || 0), 0);

  return (
    <div className="space-y-3">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="p-2 rounded-xl bg-amber-500/20 border border-amber-500/50 text-amber-300 text-xs font-bold text-center animate-fade-in shadow-md">
          {toastMessage}
        </div>
      )}

      {/* Admin Header */}
      <div className="p-3 rounded-2xl bg-gradient-to-r from-slate-900 via-amber-950/30 to-slate-900 border border-amber-500/30 space-y-2 glass-card">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="text-xl">👑</span>
            <div>
              <h2 className="text-sm font-black text-amber-300 tracking-tight">
                Admin Control Dashboard
              </h2>
              <div className="text-[10px] text-slate-400 font-mono">
                Central Oversight & Payout Management
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={fetchAdminData}
              className="px-2 py-1 text-[10px] font-bold rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 cursor-pointer"
              title="Refresh Firestore Data"
            >
              {loading ? "Syncing..." : "🔄 Sync Data"}
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="px-2 py-1 text-[10px] font-bold rounded-lg bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800 cursor-pointer"
              >
                Exit Portal
              </button>
            )}
          </div>
        </div>

        {/* Live Metrics Summary Bar */}
        <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-slate-800/80 text-[10px] text-center">
          <div className="p-1.5 rounded-lg bg-slate-950/70 border border-slate-800">
            <div className="text-slate-400">Student Users</div>
            <div className="font-extrabold text-cyan-300 text-xs">{userProfiles.length} 👥</div>
          </div>
          <div className="p-1.5 rounded-lg bg-slate-950/70 border border-slate-800">
            <div className="text-slate-400">Pending Payouts</div>
            <div className="font-extrabold text-amber-400 text-xs">{pendingRequests.length} 💸</div>
          </div>
          <div className="p-1.5 rounded-lg bg-slate-950/70 border border-slate-800">
            <div className="text-slate-400">Pending Gold</div>
            <div className="font-extrabold text-emerald-300 text-xs">{totalPendingGold} 🪙</div>
          </div>
        </div>
      </div>

      {/* Admin Tab Switcher */}
      <div className="grid grid-cols-2 gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800 text-xs">
        <button
          onClick={() => setAdminTab("payouts")}
          className={`py-1.5 px-2 rounded-lg font-bold transition-all text-center flex items-center justify-center gap-1 cursor-pointer ${
            adminTab === "payouts"
              ? "bg-gradient-to-r from-amber-500 to-orange-600 text-slate-950 shadow"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <span>💸 Gold-to-INR Requests</span>
          {pendingRequests.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-rose-600 text-white text-[9px] font-black">
              {pendingRequests.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setAdminTab("users")}
          className={`py-1.5 px-2 rounded-lg font-bold transition-all text-center cursor-pointer ${
            adminTab === "users"
              ? "bg-gradient-to-r from-amber-500 to-orange-600 text-slate-950 shadow"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          👁️ Spectate Users ({userProfiles.length})
        </button>
      </div>

      {/* TAB 1: Gold to INR Requests Queue */}
      {adminTab === "payouts" && (
        <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
          {payoutRequests.length === 0 ? (
            <div className="p-6 rounded-xl border border-slate-800 bg-slate-900/40 text-center space-y-1.5">
              <div className="text-3xl">💸</div>
              <div className="text-xs font-bold text-slate-300">No Payout Requests Found</div>
              <p className="text-[11px] text-slate-400">
                When students request Gold-to-INR UPI cash-outs, their transfer requests will appear here for your approval.
              </p>
            </div>
          ) : (
            payoutRequests.map((payout) => (
              <div
                key={payout.id}
                className={`p-3 rounded-xl border space-y-2 glass-card transition-all ${
                  payout.status === "PENDING_ADMIN_APPROVAL"
                    ? "border-amber-500/50 bg-amber-950/20"
                    : payout.status.includes("APPROVED")
                    ? "border-emerald-500/40 bg-emerald-950/10"
                    : "border-rose-500/40 bg-rose-950/10"
                }`}
              >
                {/* User & Request Details */}
                <div className="flex justify-between items-start text-xs">
                  <div>
                    <div className="font-extrabold text-slate-100 flex items-center gap-1">
                      <span>👤 {payout.username || payout.name || "Adventurer"}</span>
                    </div>
                    {payout.email && (
                      <div className="text-[10px] text-slate-400">{payout.email}</div>
                    )}
                    {payout.mobileNumber && (
                      <div className="text-[10px] text-cyan-400 font-mono">📱 Mobile: {payout.mobileNumber}</div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="font-black text-amber-400 font-mono text-sm">
                      {payout.inrValue}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      ({payout.goldAmount} Gold 🪙)
                    </div>
                  </div>
                </div>

                {/* Target UPI ID */}
                <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800 flex justify-between items-center text-xs">
                  <span className="text-slate-400 text-[10px]">Target UPI:</span>
                  <span className="font-mono text-emerald-300 font-bold select-all">
                    {payout.upiId}
                  </span>
                </div>

                {/* Status & Actions */}
                <div className="flex justify-between items-center pt-1 border-t border-slate-800 text-[10px]">
                  <span
                    className={`font-bold px-2 py-0.5 rounded ${
                      payout.status === "PENDING_ADMIN_APPROVAL"
                        ? "bg-amber-950 text-amber-300 border border-amber-800"
                        : payout.status.includes("APPROVED")
                        ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                        : "bg-rose-950 text-rose-300 border border-rose-800"
                    }`}
                  >
                    {payout.status}
                  </span>

                  {payout.status === "PENDING_ADMIN_APPROVAL" && (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleRejectPayout(payout)}
                        className="px-2 py-1 font-bold rounded bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800 cursor-pointer"
                        title="Reject payout & refund Gold back to student"
                      >
                        ❌ Reject
                      </button>
                      <button
                        onClick={() => handleApprovePayout(payout)}
                        className="px-2.5 py-1 font-bold rounded bg-emerald-600 hover:bg-emerald-500 text-slate-950 cursor-pointer shadow"
                        title="Approve & mark UPI transfer complete"
                      >
                        ✅ Approve UPI
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 2: Spectate Users & Active Quests */}
      {adminTab === "users" && (
        <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
          {userProfiles.length === 0 ? (
            <div className="p-6 rounded-xl border border-slate-800 bg-slate-900/40 text-center space-y-1.5">
              <div className="text-3xl">👥</div>
              <div className="text-xs font-bold text-slate-300">No Student Profiles Synced</div>
              <p className="text-[11px] text-slate-400">
                When users log in or sync profile details to Cloud Firestore, their hero profiles will appear here for oversight.
              </p>
            </div>
          ) : (
            userProfiles.map((user) => (
              <div
                key={user.id}
                className="p-3 rounded-xl border border-slate-800 bg-slate-900/70 glass-card space-y-2"
              >
                {/* User Header */}
                <div className="flex justify-between items-start text-xs">
                  <div>
                    <div className="font-extrabold text-slate-100 flex items-center gap-1.5">
                      <span>⚡ {user.username || user.name || "Adventurer"}</span>
                      {user.isDead ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-950 text-rose-400 font-bold border border-rose-800">
                          💀 FAINTED
                        </span>
                      ) : (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 font-bold border border-emerald-800">
                          🟢 ACTIVE
                        </span>
                      )}
                    </div>
                    {user.email && (
                      <div className="text-[10px] text-slate-400">{user.email}</div>
                    )}
                    {user.mobileNumber ? (
                      <div className="text-[10px] text-cyan-400 font-mono">📱 Mobile: {user.mobileNumber}</div>
                    ) : (
                      <div className="text-[10px] text-slate-500 font-mono italic">📱 Mobile: Not provided</div>
                    )}
                  </div>
                  <div className="text-right flex items-center gap-2">
                    <div>
                      <div className="font-extrabold text-emerald-400 text-xs">
                        Lvl {user.level || 1}
                      </div>
                      <div className="text-[10px] text-amber-400 font-mono font-bold">
                        {user.gold || 0} Gold 🪙
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteUserProfile(user.id, user.username || user.name)}
                      className="text-slate-400 hover:text-rose-400 p-1 text-xs cursor-pointer font-bold"
                      title="Delete profile document from Firestore"
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                {/* Vitals Grid */}
                <div className="grid grid-cols-3 gap-1 text-[10px] p-2 rounded-lg bg-slate-950/80 border border-slate-800 text-center font-mono">
                  <div>
                    <span className="text-slate-400 block text-[9px]">HP:</span>
                    <span className={user.isDead ? "text-rose-400 font-bold" : "text-emerald-400 font-bold"}>
                      {user.hp || 300} / {user.maxHp || 300}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[9px]">XP:</span>
                    <span className="text-purple-400 font-bold">{user.xp || 0}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[9px]">Focus Mode:</span>
                    <span className={user.focusMode !== false ? "text-emerald-400 font-bold" : "text-slate-500 font-bold"}>
                      {user.focusMode !== false ? "ON 🟢" : "OFF ⚪"}
                    </span>
                  </div>
                </div>

                <div className="text-[10px] text-slate-400 flex justify-between items-center">
                  <span>UPI Address:</span>
                  <span className={user.upiId ? "font-mono text-amber-300 font-bold" : "font-mono text-slate-500 italic"}>
                    {user.upiId || "Not provided"}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
