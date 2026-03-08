import { sendWelcomeEmail } from "../nodemailer";
import { inngest } from "./client";
import { PERSONALIZED_WELCOME_EMAIL_PROMPT } from "./prompts";

export const sendSignUpEmail = inngest.createFunction(
    {id: 'sign-up-email'},
    {event: 'app/user.created'},
    async ({event,step}) => {
        const userProfile = `
        - Country: ${event.data.country}
        - Investment goals: ${event.data.investmentGoals}
        - Risk tolerance: ${event.data.riskTolerance}
        - Preferred industry: ${event.data.preferredIndustry}
        `

        const prompt = PERSONALIZED_WELCOME_EMAIL_PROMPT.replace('{{userProfile}}',userProfile)

        let introText = 'Thanks for joining Signalist. You now have the tools to track markets and make smarter moves'

        try {
            const response = await step.ai.infer('generate-welcome-intro',{
                model: step.ai.models.gemini({model: 'gemini-2.0-flash-lite'}),
                body: {
                    contents:[
                        {
                            role: 'user',
                            parts:[
                                    {text: prompt}
                            ]
                            }
                        ]
                    }   
            })

            const part = response.candidates?.[0]?.content?.parts?.[0]
            const generatedText = part && 'text' in part ? part.text : null
            if (generatedText) {
                introText = generatedText
            }
        } catch (error) {
            // Fall back to default message if AI generation fails (e.g., quota exceeded)
            console.error('AI generation failed, using default intro:', error)
        }

        await step.run('send-welcome-email',async() => {
            const {data : {email,name}} = event
            return await sendWelcomeEmail({
                email,name,intro : introText
            })
        })
        return {
            success : true,
            message: 'Welcome email sent successfully'
        }
    }
)