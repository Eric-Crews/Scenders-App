import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { authedFetch } from "@/lib/sync";

type Report = { id:string; title:string|null; description:string; status:string; category:string|null; priority:string; latitude:number; longitude:number };
type Detail = { name:string; description:string|null; publicReportUrl:string; reports:Report[] };
export default function ProjectDetailScreen() {
 const {id}=useLocalSearchParams<{id:string}>(); const colors=useColors(); const insets=useSafeAreaInsets(); const [data,setData]=useState<Detail|null>(null);
 useEffect(()=>{if(id) void authedFetch<Detail>(`/projects/${id}`).then(setData).catch(()=>setData(null));},[id]);
 if(!data)return <View style={[styles.center,{backgroundColor:colors.background}]}><ActivityIndicator color={colors.primary}/></View>;
 return <ScrollView style={{backgroundColor:colors.background}} contentContainerStyle={{padding:20,paddingTop:insets.top+18,gap:14}}><Text style={[styles.title,{color:colors.foreground}]}>{data.name}</Text><Text style={[styles.copy,{color:colors.mutedForeground}]}>{data.description||"Field reports for this project."}</Text><View style={[styles.link,{backgroundColor:colors.muted}]}><Text style={[styles.linkLabel,{color:colors.primary}]}>Public reporting link</Text><Text selectable style={{color:colors.mutedForeground}}>{data.publicReportUrl}</Text></View><Text style={[styles.section,{color:colors.foreground}]}>Map reports</Text>{data.reports.map(r=><View key={r.id} style={[styles.card,{backgroundColor:colors.card,borderColor:colors.border}]}><Text style={[styles.report,{color:colors.foreground}]}>{r.title||r.category||"Field report"}</Text><Text style={[styles.copy,{color:colors.mutedForeground}]}>{r.status} · {r.priority} · {r.latitude.toFixed(5)}, {r.longitude.toFixed(5)}</Text><Text style={[styles.copy,{color:colors.mutedForeground}]} numberOfLines={2}>{r.description}</Text></View>)}</ScrollView>;
}
const styles=StyleSheet.create({center:{flex:1,alignItems:"center",justifyContent:"center"},title:{fontSize:28,fontWeight:"800"},section:{fontSize:18,fontWeight:"800",marginTop:6},copy:{fontSize:14,lineHeight:20},link:{padding:14,borderRadius:12,gap:4},linkLabel:{fontWeight:"800"},card:{padding:15,borderWidth:1,borderRadius:14,gap:6},report:{fontSize:16,fontWeight:"800"}});