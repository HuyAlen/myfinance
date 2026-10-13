import { afterEach, describe, expect, it, vi } from "vitest";
import { accountSettingsKey } from "@/src/lib/date/dateFormatPreference";
import { NOTIFICATION_PREFERENCES_CHANGED } from "./notificationPreferences";
import {
  NOTIFICATION_CLOUD_METADATA_KEY,
  applyNotificationCloudSettings,
  notificationCloudSettingsFromMetadata,
  pullNotificationCloudSettings,
  pushNotificationCloudSettings,
  toNotificationCloudSettings,
} from "./notificationCloudSync";
vi.mock("@/src/components/auth/AuthProvider", () => ({useAuth:()=>({user:null})}));
afterEach(()=>vi.unstubAllGlobals());
const values = toNotificationCloudSettings(
  {notifBudget:false,notifGoal:true,notifDebt:false},
  {budgetAlert:92,debtAlert:145},
);
describe("MYFINANCE-NOTIFICATION-PREFERENCES-SYNC-1 account-owned Auth metadata",()=>{
  it("validates metadata and leaves absent or malformed data untouched",()=>{
    expect(notificationCloudSettingsFromMetadata({})).toBeNull();
    expect(notificationCloudSettingsFromMetadata({[NOTIFICATION_CLOUD_METADATA_KEY]:{...values,notifDebt:"false"}})).toBeNull();
    expect(notificationCloudSettingsFromMetadata({[NOTIFICATION_CLOUD_METADATA_KEY]:{...values,debtAlert:201}})).toBeNull();
    expect(notificationCloudSettingsFromMetadata({[NOTIFICATION_CLOUD_METADATA_KEY]:values})).toEqual(values);
  });
  it("rejects wrong identity and remote error BEFORE updating user metadata",async()=>{
    const updateUser = vi.fn(async()=>({error:null}));
    const auth = {getUser:async()=>({data:{user:{id:"other",user_metadata:{}}},error:null}),updateUser};
    await expect(pushNotificationCloudSettings("mine",values,auth)).rejects.toThrow("xác minh");
    expect(updateUser).not.toHaveBeenCalled();
    await expect(pullNotificationCloudSettings("mine",auth)).rejects.toThrow("xác minh");
  });
  it("pushes only the versioned metadata field and propagates cloud failures",async()=>{
    const updateUser = vi.fn(async()=>({error:null}));
    const auth = {getUser:async()=>({data:{user:{id:"mine",user_metadata:{}}},error:null}),updateUser};
    await pushNotificationCloudSettings("mine",values,auth);
    expect(updateUser).toHaveBeenCalledWith({data:{[NOTIFICATION_CLOUD_METADATA_KEY]:values}});
    updateUser.mockImplementationOnce(async()=>({error:null}));
    const failing = {getUser:auth.getUser,updateUser:async()=>({error:{message:"offline"}})};
    await expect(pushNotificationCloudSettings("mine",values,failing)).rejects.toThrow("không thành công");
  });
  it("pull returns null before initial save, and returns complete saved values afterwards",async()=>{
    const makeAuth = (metadata: unknown) => ({
      getUser:async()=>({data:{user:{id:"mine",user_metadata:metadata}},error:null}),
      updateUser:async()=>({error:null}),
    });
    expect(await pullNotificationCloudSettings("mine",makeAuth({}))).toBeNull();
    expect(await pullNotificationCloudSettings("mine",makeAuth({[NOTIFICATION_CLOUD_METADATA_KEY]:values}))).toEqual(values);
  });
  it("merges remote fields into ONLY the target account without overwriting other settings, and emits change",()=>{
    const other = JSON.stringify({version:1,notifBudget:true,profileName:"Other"});
    const mine = JSON.stringify({version:1,profileName:"Profile",dateFormat:"dd/mm/yyyy",birthDate:"2020-01-01",theme:"dark",budgetAlert:"80"});
    const items = new Map<string,string>([[accountSettingsKey("mine"),mine],[accountSettingsKey("other"),other]]);
    const events:string[]=[];
    vi.stubGlobal("window",{
      localStorage:{getItem:(k:string)=>items.get(k)??null,setItem:(k:string,v:string)=>items.set(k,v)},
      dispatchEvent:(event:Event)=>{events.push(event.type);return true;},
    });
    expect(applyNotificationCloudSettings("mine",values)).toBe(true);
    const after = JSON.parse(items.get(accountSettingsKey("mine"))??"null") as Record<string,unknown>;
    expect(after).toMatchObject({profileName:"Profile",dateFormat:"dd/mm/yyyy",theme:"dark",birthDate:"2020-01-01",notifBudget:false,notifGoal:true,notifDebt:false,budgetAlert:"92",debtAlert:"145"});
    expect(items.get(accountSettingsKey("other"))).toBe(other);
    expect(events).toEqual([NOTIFICATION_PREFERENCES_CHANGED]);
    expect(applyNotificationCloudSettings("mine",values)).toBe(false);
    expect(events).toHaveLength(1);
  });
  it("fails closed on corrupt local cache instead of wiping unrelated settings",()=>{
    const items = new Map<string,string>([[accountSettingsKey("mine"),"invalid-json"]]);
    vi.stubGlobal("window", {localStorage:{getItem:(k:string)=>items.get(k)??null,setItem:(k:string,v:string)=>items.set(k,v)},dispatchEvent:()=>true});
    expect(()=>applyNotificationCloudSettings("mine",values)).toThrow();
    expect(items.get(accountSettingsKey("mine"))).toBe("invalid-json");
  });
});
