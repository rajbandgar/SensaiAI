"use server";

import { db } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// Generate AI insights
export const generateAIInsights = async (industry) => {
  const prompt = `
Analyze the current state of the ${industry} industry and return ONLY valid JSON.

{
  "salaryRanges": [
    { "role": "string", "min": number, "max": number, "median": number, "location": "string" }
  ],
  "growthRate": number,
  "demandLevel": "HIGH" | "MEDIUM" | "LOW",
  "topSkills": ["skill1","skill2"],
  "marketOutlook": "POSITIVE" | "NEUTRAL" | "NEGATIVE",
  "keyTrends": ["trend1","trend2"],
  "recommendedSkills": ["skill1","skill2"]
}

Rules:
- Return ONLY JSON
- No explanation
- At least 5 roles in salaryRanges
- At least 5 skills
- growthRate must be a number
`;

  const response = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: prompt,
});

  const text = response.text;

  const cleanedText = text
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();

  return JSON.parse(cleanedText);
};

// Get industry insights
export async function getIndustryInsights() {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("Unauthorized");
  }

  const user = await db.user.findUnique({
    where: {
      clerkUserId: userId,
    },
    include: {
      industryInsight: true,
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  // If insights already exist
  if (user.industryInsight) {
    return user.industryInsight;
  }

  let insights;

  try {
    insights = await generateAIInsights(user.industry);
  } catch (error) {
    console.error("Gemini Error:", error);

    // fallback data if AI fails
    insights = {
      salaryRanges: [],
      growthRate: 0,
      demandLevel: "MEDIUM",
      topSkills: [],
      marketOutlook: "NEUTRAL",
      keyTrends: [],
      recommendedSkills: [],
    };
  }

  const industryInsight = await db.industryInsight.create({
    data: {
      industry: user.industry,
      salaryRanges: insights.salaryRanges,
      growthRate: insights.growthRate,
      demandLevel: insights.demandLevel,
      topSkills: insights.topSkills,
      marketOutlook: insights.marketOutlook,
      keyTrends: insights.keyTrends,
      recommendedSkills: insights.recommendedSkills,
      nextUpdate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  return industryInsight;
}