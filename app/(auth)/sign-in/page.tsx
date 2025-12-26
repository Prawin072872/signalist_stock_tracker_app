'use client'


import React from 'react'
import { SubmitHandler, useForm } from 'react-hook-form'
import InputField from '@/components/forms/InputField'
import { Button } from '@/components/ui/button'
import FooterLink from '@/components/forms/FooterLink'

const SignIn = () => {
    const {
      register,
      handleSubmit,
      control,
      formState : {errors,isSubmitting}
    } = useForm<SignInFormData>({
      defaultValues : {
      email : '',
      password : '',
      },
      mode : 'onBlur'
    })

    const onSubmit = async(data : SignInFormData) => {
      try {
        console.log(data)
      }catch(e){
        console.log(e)
      }
    }
  return (
    <div className="min-h-150 flex flex-col justify-center">
      <h1 className="form-title">Log In your Account</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <InputField
          name="email"
          label="Email"
          placeholder="contact@jsmastery.com"
          register={register}
          error={errors.email}
          validation={{
            required: "Email is required",
            pattern: {
              value: /^\w+@\w+\.\w+$/,
              message: "Email Address is not Valid",
            },
          }}
        />
        <InputField
          name="password"
          label="Password"
          placeholder="Enter a Strong password"
          type="password"
          register={register}
          error={errors.password}
          validation={{ required: "Password is required", minLength: 8 }}
        />
        <Button
          type="submit"
          disabled={isSubmitting}
          className="yellow-btn w-full mt-5"
        >
          {isSubmitting ? "Logging In" : "Log In"}
        </Button>

        <FooterLink text={`Don't have an account?`} linkText='Sign Up' href='/sign-up'/>
      </form>
    </div>
  );
}

export default SignIn