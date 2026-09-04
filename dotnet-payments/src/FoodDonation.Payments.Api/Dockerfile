# syntax=docker/dockerfile:1
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src
COPY FoodDonation.Payments.Api.csproj ./
RUN dotnet restore FoodDonation.Payments.Api.csproj
COPY . ./
RUN dotnet publish FoodDonation.Payments.Api.csproj -c Release -o /app /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS runtime
WORKDIR /app
COPY --from=build /app ./
EXPOSE 8080
ENV ASPNETCORE_URLS=http://+:8080
ENTRYPOINT ["dotnet", "FoodDonation.Payments.Api.dll"]
