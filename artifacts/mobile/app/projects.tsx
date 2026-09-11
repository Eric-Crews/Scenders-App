import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth";
import { authedFetch } from "@/lib/sync";

type Project = { id: string; name: string; description: string | null; status: string; reportCount: number; updatedAt: string };

export default function ProjectsScreen() {
  const colors = useColors(); const router = useRouter(); const insets = useSafeAreaInsets();
  const { isAuthenticated, login } = useAuth(); const [projects, setProjects] = useState<Project[]>([]); const [loading, setLoading] = useState(true);
  const [name, setName] = useState(""); const [creating, setCreating] = useState(false);
  const load = useCallback(async () => {
    if (!isAuthenticated) { setLoading(false); return; }
    try { setProjects(await authedFetch<Project[]>("/projects")); } catch (error) { Alert.alert("Couldn't load projects", error instanceof Error ? error.message : "Try again."); } finally { setLoading(false); }
  }, [isAuthenticated]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const create = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try { const project = await authedFetch<Project>("/projects", { method: "POST", jsonBody: { name: name.trim() } }); setName(""); router.push(`/projects/${project.id}`); }
    catch (error) { Alert.alert("Couldn't create project", error instanceof Error ? error.message : "Try again."); } finally { setCreating(false); }
  };
  if (!isAuthenticated) return <View style={[styles.center, { backgroundColor: colors.background, padding: 28 }]}><Feather name="map-pin" size={32} color={colors.primary}/><Text style={[styles.title,{color:colors.foreground}]}>Projects need an account</Text><Text style={[styles.copy,{color:colors.mutedForeground}]}>Sign in to manage field reports, routes, and your private public-reporting link.</Text><Pressable onPress={() => void login()} style={[styles.button,{backgroundColor:colors.primary}]}><Text style={{color:colors.primaryForeground,fontWeight:"800"}}>Sign in</Text></Pressable></View>;
  return <ScrollView style={{backgroundColor:colors.background}} contentContainerStyle={{padding:20,paddingTop:insets.top+16,paddingBottom:insets.bottom+32,gap:14}}>
    <View><Text style={[styles.eyebrow,{color:colors.primary}]}>FIELD OPERATIONS</Text><Text style={[styles.title,{color:colors.foreground}]}>Projects</Text><Text style={[styles.copy,{color:colors.mutedForeground}]}>Map field issues, keep resolution work visible to your crew, and collect reports privately.</Text></View>
    <View style={[styles.create,{backgroundColor:colors.card,borderColor:colors.border}]}><TextInput value={name} onChangeText={setName} placeholder="New project name" placeholderTextColor={colors.mutedForeground} style={[styles.input,{color:colors.foreground,borderColor:colors.border}]} returnKeyType="done" onSubmitEditing={() => void create()}/><Pressable disabled={creating||!name.trim()} onPress={() => void create()} style={[styles.button,{backgroundColor:colors.primary,opacity:creating||!name.trim()?.55:1}]}><Text style={{color:colors.primaryForeground,fontWeight:"800"}}>{creating?"Creating…":"Create project"}</Text></Pressable></View>
    {loading ? <ActivityIndicator color={colors.primary}/> : projects.length ? projects.map(project => <Pressable key={project.id} onPress={() => router.push(`/projects/${project.id}`)} style={[styles.project,{backgroundColor:colors.card,borderColor:colors.border}]}><View style={{flex:1}}><Text style={[styles.projectName,{color:colors.foreground}]}>{project.name}</Text><Text style={[styles.projectMeta,{color:colors.mutedForeground}]}>{project.reportCount} report{project.reportCount===1?"":"s"} · {project.status}</Text></View><Feather name="chevron-right" size={20} color={colors.mutedForeground}/></Pressable>) : <View style={[styles.empty,{backgroundColor:colors.muted}]}><Feather name="flag" size={24} color={colors.primary}/><Text style={[styles.copy,{color:colors.mutedForeground}]}>Create a project to start collecting and resolving field reports.</Text></View>}
  </ScrollView>;
}
const styles=StyleSheet.create({center:{flex:1,alignItems:"center",justifyContent:"center",gap:14},eyebrow:{fontSize:12,fontWeight:"800",letterSpacing:1.4},title:{fontSize:30,fontWeight:"800"},copy:{fontSize:15,lineHeight:22},create:{padding:14,borderWidth:1,borderRadius:14,gap:10},input:{borderWidth:1,borderRadius:10,paddingHorizontal:12,paddingVertical:12,fontSize:16},button:{alignItems:"center",borderRadius:10,padding:13},project:{borderWidth:1,borderRadius:14,padding:16,flexDirection:"row",alignItems:"center"},projectName:{fontSize:17,fontWeight:"800"},projectMeta:{fontSize:13,marginTop:4},empty:{borderRadius:14,padding:22,gap:10}});