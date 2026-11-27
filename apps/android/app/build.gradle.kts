plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

val appVersionName: String = project.property("appVersionName").toString()
val appVersionCode: Int = project.property("appVersionCode").toString().toInt()

android {
    namespace = "org.plantplanner.survey"
    compileSdk = 36

    defaultConfig {
        applicationId = "org.plantplanner.survey"
        minSdk = 29
        targetSdk = 35
        versionCode = appVersionCode
        versionName = appVersionName
        buildConfigField("String", "GITHUB_REPO", "\"LoopyLuci/PlantPlannerPlatform\"")
    }

    buildTypes {
        // Test builds are signed with the local debug key, so each build installs over the last
        // one and the self-updater can replace it. A public release needs its own key (see TODO).
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    testOptions {
        unitTests.isReturnDefaultValues = false
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.material3)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.sceneview)
    implementation(libs.arsceneview)

    testImplementation(libs.junit)
    testImplementation(libs.org.json)
}
